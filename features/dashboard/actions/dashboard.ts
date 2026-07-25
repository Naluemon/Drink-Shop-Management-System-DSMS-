"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateCompanySettings } from "@/lib/settings";
import { getBusinessDayRange } from "@/lib/business-day";

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

interface PeriodSummary {
  transactionCount: number;
  revenue: number;
  cogs: number;
  profit: number;
  expenses: number;
  netProfit: number;
}

// Reversal rows (void/refund) store the SAME positive totalAmount/costAtSaleTime
// as the original — the sign is implied by reversalOfId, not by the stored
// value (same convention as inventory_movements' "reversal" type). Summing a
// business day's rows this way nets same-day voids to zero (FR-POS acceptance)
// and lets a refund of a past day's sale reduce the day it was actually refunded.
async function summarizePeriod(start: Date, end: Date): Promise<PeriodSummary> {
  const transactions = await prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: true },
  });

  let revenue = 0;
  let cogs = 0;
  let transactionCount = 0;
  for (const t of transactions) {
    const sign = t.reversalOfId ? -1 : 1;
    revenue += sign * Number(t.totalAmount);
    cogs += sign * t.items.reduce((sum, i) => sum + Number(i.costAtSaleTime) * i.quantity, 0);
    if (sign > 0) transactionCount += 1;
  }

  const expenseEntries = await prisma.expenseEntry.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });
  const expenses = expenseEntries.reduce((sum, e) => sum + Number(e.amount), 0);

  const profit = revenue - cogs;
  const netProfit = profit - expenses;

  return { transactionCount, revenue, cogs, profit, expenses, netProfit };
}

async function getBestSellers(start: Date, end: Date, limit = 5) {
  const transactions = await prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: { include: { menu: true } } },
  });

  const qtyByMenu = new Map<string, { name: string; qty: number }>();
  for (const t of transactions) {
    const sign = t.reversalOfId ? -1 : 1;
    for (const item of t.items) {
      const prev = qtyByMenu.get(item.menuId) ?? { name: item.menu.name, qty: 0 };
      prev.qty += sign * item.quantity;
      qtyByMenu.set(item.menuId, prev);
    }
  }

  return Array.from(qtyByMenu.values())
    .filter((m) => m.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export interface TrendPoint {
  date: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

// A "use server" file may only export async functions — not this array, so
// it stays module-private; export the derived type only (types are erased
// at compile time, so exporting one doesn't trip that rule).
const DASHBOARD_RANGES = ["7d", "30d", "3m", "6m", "9m", "12m"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

// Only used for the daily-bucket ranges (7d/30d) — months don't divide
// evenly by 30 (365 / 30 is not an integer), so monthly ranges use
// RANGE_MONTHS below instead of deriving a month count from a day count.
const RANGE_DAYS: Partial<Record<DashboardRange, number>> = {
  "7d": 7,
  "30d": 30,
};

const RANGE_MONTHS: Partial<Record<DashboardRange, number>> = {
  "3m": 3,
  "6m": 6,
  "9m": 9,
  "12m": 12,
};

// Daily buckets stay readable and cheap through 30 days; past that, 90-365
// individual days would be both unreadable on the chart and slow to compute
// (see below), so longer ranges roll up to calendar months instead.
function usesMonthlyBuckets(range: DashboardRange): boolean {
  return range !== "7d" && range !== "30d";
}

interface Bucket {
  key: string; // ISO string of the bucket's start — also the chart's x-axis value
  start: Date;
  end: Date;
}

function buildDailyBuckets(
  now: Date,
  days: number,
  timezone: string,
  businessDayStartHour: number,
): Bucket[] {
  const buckets: Bucket[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const referenceDate = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const r = getBusinessDayRange(referenceDate, timezone, businessDayStartHour);
    buckets.push({ key: r.start.toISOString(), start: r.start, end: r.end });
  }
  return buckets;
}

function buildMonthlyBuckets(now: Date, months: number): Bucket[] {
  const buckets: Bucket[] = [];
  const anchor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() - offset + 1, 1);
    buckets.push({ key: start.toISOString(), start, end });
  }
  return buckets;
}

interface TransactionAggregate {
  createdAt: Date;
  totalAmount: number;
  reversalOfId: string | null;
  cogs: number;
}

// TESTING.md §10 perf budget (<2s dashboard load): at production scale (~1
// year / ~15k transactions) `salesTransaction.findMany({ include: { items } })`
// pulls every item row across the whole range into Node just to sum them,
// which measured ~3.5s for a 12-month range — well past budget. Summing
// cost_at_sale_time per transaction in SQL (one row out per transaction,
// not per item) cuts that to the transaction count instead of the item
// count, and lets Postgres use the existing sales_transaction_items
// (sales_transaction_id) index instead of shipping full Decimal item
// objects over the wire. Bucketing itself (the loop below) is unchanged.
async function fetchTransactionAggregates(start: Date, end: Date): Promise<TransactionAggregate[]> {
  return prisma.$queryRaw<TransactionAggregate[]>`
    SELECT
      st.created_at AS "createdAt",
      st.total_amount::float8 AS "totalAmount",
      st.reversal_of_id AS "reversalOfId",
      COALESCE(SUM(sti.cost_at_sale_time * sti.quantity), 0)::float8 AS "cogs"
    FROM sales_transactions st
    LEFT JOIN sales_transaction_items sti ON sti.sales_transaction_id = st.id
    WHERE st.created_at >= ${start} AND st.created_at < ${end}
    GROUP BY st.id, st.created_at, st.total_amount, st.reversal_of_id
  `;
}

// One fetch for the whole range (not one query per bucket — that's the
// difference between 2 DB round trips and up to 365 of them) then a single
// pass to accumulate each row into its bucket. Every reversal (void/refund)
// still nets against its original per D5/FR-POS, same convention as summarizePeriod.
async function getTrendData(
  range: DashboardRange,
  now: Date,
  timezone: string,
  businessDayStartHour: number,
): Promise<TrendPoint[]> {
  const monthly = usesMonthlyBuckets(range);
  const buckets = monthly
    ? buildMonthlyBuckets(now, RANGE_MONTHS[range]!)
    : buildDailyBuckets(now, RANGE_DAYS[range]!, timezone, businessDayStartHour);

  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const [transactions, expenseEntries] = await Promise.all([
    fetchTransactionAggregates(rangeStart, rangeEnd),
    prisma.expenseEntry.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
    }),
  ]);

  const points = buckets.map((b) => ({ date: b.key, revenue: 0, cogs: 0, expenses: 0 }));

  // Direct index math instead of a per-transaction scan through every bucket:
  // daily buckets are all exactly 24h, so elapsed-time-since-start divides
  // evenly into a day index; monthly buckets use calendar month arithmetic.
  function bucketIndexFor(date: Date): number {
    if (monthly) {
      const first = buckets[0].start;
      return (date.getFullYear() - first.getFullYear()) * 12 + (date.getMonth() - first.getMonth());
    }
    return Math.floor((date.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));
  }

  for (const t of transactions) {
    const idx = bucketIndexFor(t.createdAt);
    if (idx < 0 || idx >= points.length) continue;
    const sign = t.reversalOfId ? -1 : 1;
    points[idx].revenue += sign * t.totalAmount;
    points[idx].cogs += sign * t.cogs;
  }
  for (const e of expenseEntries) {
    const idx = bucketIndexFor(e.createdAt);
    if (idx < 0 || idx >= points.length) continue;
    points[idx].expenses += Number(e.amount);
  }

  return points.map((p) => ({
    date: p.date,
    revenue: p.revenue,
    expenses: p.expenses,
    netProfit: p.revenue - p.cogs - p.expenses,
  }));
}

// Client-triggered refetch when the dashboard's period filter changes —
// getDashboardData() below only ever loads the "7d" default on first render.
export async function getDashboardTrend(range: DashboardRange) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "dashboard");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูแดชบอร์ด") };
  }

  if (!DASHBOARD_RANGES.includes(range)) {
    return { error: "ช่วงเวลาที่เลือกไม่ถูกต้อง" };
  }

  const companySettings = await getOrCreateCompanySettings();
  const trend = await getTrendData(
    range,
    new Date(),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );
  return { trend };
}

async function getLowStockItems() {
  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null, lowStockThreshold: { not: null } },
  });

  return ingredients
    .filter((i) => Number(i.currentStockQty) <= Number(i.lowStockThreshold))
    .map((i) => ({
      name: i.name,
      currentStockQty: i.currentStockQty.toString(),
      lowStockThreshold: i.lowStockThreshold!.toString(),
      baseUnit: i.baseUnit,
    }));
}

// FR-DASH-01/02: Today's Sales, Profit, Revenue, Best Seller, Low Stock,
// Expenses, Net Profit — "today"/"yesterday" grouped by business day
// boundary (DECISIONS.md D8), not calendar midnight.
export async function getDashboardData() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "dashboard");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูแดชบอร์ด") };
  }

  const companySettings = await getOrCreateCompanySettings();
  const now = new Date();
  const today = getBusinessDayRange(
    now,
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );
  // 24h before "now" always falls inside yesterday's business-day window,
  // since `today`'s window is itself exactly 24h and contains "now".
  const yesterday = getBusinessDayRange(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );

  const [todaySummary, yesterdaySummary, bestSellers, lowStockItems, trend] = await Promise.all([
    summarizePeriod(today.start, today.end),
    summarizePeriod(yesterday.start, yesterday.end),
    getBestSellers(today.start, today.end),
    getLowStockItems(),
    getTrendData("7d", now, companySettings.timezone, companySettings.businessDayStartHour),
  ]);

  return {
    today: todaySummary,
    yesterday: yesterdaySummary,
    bestSellers,
    lowStockItems,
    trend,
  };
}
