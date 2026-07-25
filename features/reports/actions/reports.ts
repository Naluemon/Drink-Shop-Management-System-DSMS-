"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateCompanySettings } from "@/lib/settings";
import { getBusinessDayRange } from "@/lib/business-day";
import { buildReportBuckets } from "@/lib/report-period";
import { aggregateSales, sumExpenseAmounts, type SaleLine } from "@/lib/report-aggregation";
import { signPrintToken } from "@/lib/print-token";
import {
  reportQuerySchema,
  dateRangeSchema,
  type ReportQueryInput,
  type DateRangeInput,
} from "../schemas/report.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

function resolveOverallRange(from: Date, to: Date, timezone: string, startHour: number) {
  return {
    start: getBusinessDayRange(from, timezone, startHour).start,
    end: getBusinessDayRange(to, timezone, startHour).end,
  };
}

interface RawSale {
  createdAt: Date;
  totalAmount: number;
  reversalOfId: string | null;
  itemCost: number;
}

// FR-RPT-05: computed straight off sales_transactions/sales_transaction_items
// every call — no cached/materialized summary table that could drift from
// the ledger.
async function fetchRawSales(start: Date, end: Date): Promise<RawSale[]> {
  const transactions = await prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: true },
  });
  return transactions.map((t) => ({
    createdAt: t.createdAt,
    totalAmount: Number(t.totalAmount),
    reversalOfId: t.reversalOfId,
    itemCost: t.items.reduce((sum, i) => sum + Number(i.costAtSaleTime) * i.quantity, 0),
  }));
}

async function fetchRawExpenses(start: Date, end: Date) {
  return prisma.expenseEntry.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { category: true },
  });
}

interface SalesReportResult {
  rows: { label: string; transactionCount: number; revenue: number }[];
  totals: { transactionCount: number; revenue: number };
}

async function computeSalesReportRows(data: ReportQueryInput): Promise<SalesReportResult> {
  const companySettings = await getOrCreateCompanySettings();
  const buckets = buildReportBuckets(
    data.granularity,
    new Date(data.from),
    new Date(data.to),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const rawSales = await fetchRawSales(buckets[0].start, buckets[buckets.length - 1].end);

  const rows = buckets.map((b) => {
    const lines: SaleLine[] = rawSales
      .filter((s) => s.createdAt >= b.start && s.createdAt < b.end)
      .map((s) => ({
        totalAmount: s.totalAmount,
        itemCost: s.itemCost,
        isReversal: !!s.reversalOfId,
      }));
    const agg = aggregateSales(lines);
    return { label: b.label, transactionCount: agg.transactionCount, revenue: agg.revenue };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      transactionCount: acc.transactionCount + r.transactionCount,
      revenue: acc.revenue + r.revenue,
    }),
    { transactionCount: 0, revenue: 0 },
  );

  return { rows, totals };
}

// FR-RPT-01: Daily/Weekly/Monthly/Yearly — top-line sales only, bucketed on
// the business day boundary (DECISIONS.md D8)
export async function getSalesReport(
  input: ReportQueryInput,
): Promise<{ error: string } | SalesReportResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  const result = reportQuerySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return computeSalesReportRows(result.data);
}

// Used only by the token-gated print route (app/reports/print/sales/page.tsx)
// — there is no user session inside the headless browser Playwright drives,
// so the signed token IS the authorization proof (minted only after
// getSalesReport's/exportSalesReportPdf's own requirePermission passed).
// Never expose this to a client component or an unauthenticated route.
export async function getSalesReportForPrint(
  input: ReportQueryInput,
): Promise<{ error: string } | SalesReportResult> {
  const result = reportQuerySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return computeSalesReportRows(result.data);
}

interface ProfitReportResult {
  rows: {
    label: string;
    revenue: number;
    cogs: number;
    profit: number;
    expenses: number;
    netProfit: number;
  }[];
  totals: { revenue: number; cogs: number; profit: number; expenses: number; netProfit: number };
  expenseByCategory: { name: string; total: number }[];
}

// FR-RPT-02 "Profit" — full P&L per bucket + expense-by-category for the whole range
export async function getProfitReport(
  input: ReportQueryInput,
): Promise<{ error: string } | ProfitReportResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  const result = reportQuerySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const companySettings = await getOrCreateCompanySettings();
  const buckets = buildReportBuckets(
    result.data.granularity,
    new Date(result.data.from),
    new Date(result.data.to),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const overallStart = buckets[0].start;
  const overallEnd = buckets[buckets.length - 1].end;

  const [rawSales, rawExpenses] = await Promise.all([
    fetchRawSales(overallStart, overallEnd),
    fetchRawExpenses(overallStart, overallEnd),
  ]);

  const rows = buckets.map((b) => {
    const lines: SaleLine[] = rawSales
      .filter((s) => s.createdAt >= b.start && s.createdAt < b.end)
      .map((s) => ({
        totalAmount: s.totalAmount,
        itemCost: s.itemCost,
        isReversal: !!s.reversalOfId,
      }));
    const agg = aggregateSales(lines);

    const expenses = sumExpenseAmounts(
      rawExpenses
        .filter((e) => e.createdAt >= b.start && e.createdAt < b.end)
        .map((e) => Number(e.amount)),
    );

    return {
      label: b.label,
      revenue: agg.revenue,
      cogs: agg.cogs,
      profit: agg.profit,
      expenses,
      netProfit: agg.profit - expenses,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cogs: acc.cogs + r.cogs,
      profit: acc.profit + r.profit,
      expenses: acc.expenses + r.expenses,
      netProfit: acc.netProfit + r.netProfit,
    }),
    { revenue: 0, cogs: 0, profit: 0, expenses: 0, netProfit: 0 },
  );

  const categoryTotals = new Map<string, number>();
  for (const e of rawExpenses) {
    categoryTotals.set(
      e.category.name,
      (categoryTotals.get(e.category.name) ?? 0) + Number(e.amount),
    );
  }
  const expenseByCategory = Array.from(categoryTotals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  return { rows, totals, expenseByCategory };
}

interface ExpenseReportResult {
  rows: { name: string; total: number }[];
  grandTotal: number;
}

// FR-RPT-02 "Expense" — category breakdown for the range (its own tab too, FR-RPT-06)
export async function getExpenseReport(
  input: DateRangeInput,
): Promise<{ error: string } | ExpenseReportResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  const result = dateRangeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const companySettings = await getOrCreateCompanySettings();
  const { start, end } = resolveOverallRange(
    new Date(result.data.from),
    new Date(result.data.to),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const entries = await fetchRawExpenses(start, end);

  const categoryTotals = new Map<string, number>();
  for (const e of entries) {
    categoryTotals.set(
      e.category.name,
      (categoryTotals.get(e.category.name) ?? 0) + Number(e.amount),
    );
  }
  const rows = Array.from(categoryTotals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return { rows, grandTotal };
}

interface TopMenuReportResult {
  rows: { name: string; qty: number; revenue: number }[];
}

// FR-RPT-02 "Top Menu" — FR-RPT-06: Accountant ไม่มีสิทธิ์ดูรายงานนี้
export async function getTopMenuReport(
  input: DateRangeInput,
): Promise<{ error: string } | TopMenuReportResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  if (actor.role === "accountant") {
    return { error: "คุณไม่มีสิทธิ์ดูรายงานเมนูขายดี (D14)" };
  }

  const result = dateRangeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const companySettings = await getOrCreateCompanySettings();
  const { start, end } = resolveOverallRange(
    new Date(result.data.from),
    new Date(result.data.to),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const transactions = await prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: { include: { menu: true } } },
  });

  const byMenu = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const t of transactions) {
    const sign = t.reversalOfId ? -1 : 1;
    for (const item of t.items) {
      const prev = byMenu.get(item.menuId) ?? { name: item.menu.name, qty: 0, revenue: 0 };
      prev.qty += sign * item.quantity;
      prev.revenue += sign * (Number(item.unitPrice) * item.quantity - Number(item.discountAmount));
      byMenu.set(item.menuId, prev);
    }
  }

  const rows = Array.from(byMenu.values())
    .filter((m) => m.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 20);

  return { rows };
}

interface InventoryReportResult {
  rows: {
    name: string;
    baseUnit: string;
    currentStockQty: number;
    costPerUnit: number;
    valuation: number;
    stockIn: number;
    stockOut: number;
    adjustmentNet: number;
  }[];
  totalValuation: number;
}

// FR-RPT-02 "Inventory" — FR-RPT-06: Accountant ไม่มีสิทธิ์ดูรายงานนี้
export async function getInventoryReport(
  input: DateRangeInput,
): Promise<{ error: string } | InventoryReportResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  if (actor.role === "accountant") {
    return { error: "คุณไม่มีสิทธิ์ดูรายงานสต็อก (D14)" };
  }

  const result = dateRangeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const companySettings = await getOrCreateCompanySettings();
  const { start, end } = resolveOverallRange(
    new Date(result.data.from),
    new Date(result.data.to),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const [ingredients, movements] = await Promise.all([
    prisma.ingredient.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.inventoryMovement.findMany({ where: { createdAt: { gte: start, lt: end } } }),
  ]);

  const movementTotals = new Map<
    string,
    { stockIn: number; stockOut: number; adjustmentNet: number }
  >();
  for (const m of movements) {
    const prev = movementTotals.get(m.ingredientId) ?? {
      stockIn: 0,
      stockOut: 0,
      adjustmentNet: 0,
    };
    const qty = Number(m.quantity);
    if (m.movementType === "stock_in") prev.stockIn += qty;
    else if (m.movementType === "stock_out") prev.stockOut += qty;
    else prev.adjustmentNet += qty; // adjustment/reversal already store a signed delta
    movementTotals.set(m.ingredientId, prev);
  }

  const rows = ingredients.map((i) => {
    const mv = movementTotals.get(i.id) ?? { stockIn: 0, stockOut: 0, adjustmentNet: 0 };
    return {
      name: i.name,
      baseUnit: i.baseUnit,
      currentStockQty: Number(i.currentStockQty),
      costPerUnit: Number(i.costPerUnit),
      valuation: Number(i.currentStockQty) * Number(i.costPerUnit),
      stockIn: mv.stockIn,
      stockOut: mv.stockOut,
      adjustmentNet: mv.adjustmentNet,
    };
  });

  const totalValuation = rows.reduce((sum, r) => sum + r.valuation, 0);

  return { rows, totalValuation };
}

// DECISIONS.md D10: PDF export renders via headless Chromium (Playwright)
// navigating our own /reports/print/sales route — see lib/print-token.ts for
// why that route uses a short-lived signed token instead of the normal
// session cookie.
export async function exportSalesReportPdf(
  input: ReportQueryInput,
): Promise<{ error: string } | { success: true; pdfBase64: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "reports");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายงาน") };
  }

  const result = reportQuerySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const query = new URLSearchParams({
    granularity: result.data.granularity,
    from: result.data.from,
    to: result.data.to,
  }).toString();
  const token = signPrintToken(query);
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/reports/print/sales?${query}&token=${encodeURIComponent(token)}`;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    return { success: true, pdfBase64: Buffer.from(pdfBuffer).toString("base64") };
  } catch {
    return { error: "สร้าง PDF ไม่สำเร็จ" };
  } finally {
    await browser.close();
  }
}
