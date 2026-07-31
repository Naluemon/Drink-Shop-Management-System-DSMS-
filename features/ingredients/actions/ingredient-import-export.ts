"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { parseSpreadsheet, buildSpreadsheet, type SpreadsheetColumn } from "@/lib/spreadsheet";
import { recordStockIn } from "@/features/inventory/actions/inventory";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";
import { validateImportRows, type ParsedIngredientRow } from "../lib/validate-import";

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

const MAX_IMPORT_ROWS = 500;
const C = INGREDIENT_IMPORT_COLUMNS;

// buildSpreadsheet (lib/spreadsheet.ts) writes "" for any column a row didn't
// supply, so a blank optional cell (e.g. no conversion factor) round-trips
// through parseSpreadsheet as the *string* "" rather than a missing key. Left
// alone, ingredientImportRowSchema's z.coerce.number(...).optional() fields
// would coerce "" to 0 and then fail their .positive()/.min() checks instead
// of being treated as "not provided". Normalize blank string cells to
// undefined here, before they reach the (Task 2) pure validator, so a truly
// empty optional cell behaves the same whether it came from a real upload
// (which XLSX already omits) or a generated file (which writes "").
function sanitizeRawRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" && value.trim() === "" ? undefined : value,
    ]),
  );
}

export interface PreviewResult {
  toCreate: ParsedIngredientRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

export async function previewIngredientImport(
  fileBase64: string,
): Promise<{ error: string } | PreviewResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }

  const buffer = Buffer.from(fileBase64, "base64");
  const rawRows = parseSpreadsheet(buffer).map(sanitizeRawRow);
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const existing = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((i) => i.name.toLowerCase()));

  return validateImportRows(rawRows, existingNames);
}

export async function commitIngredientImport(rows: ParsedIngredientRow[]): Promise<
  | { error: string }
  | {
      success: true;
      createdCount: number;
      // Rows where the Ingredient (and, if applicable, UnitConversion) were
      // created but the starting-stock recordStockIn call itself returned
      // an error instead of throwing — see the loop below. Not counted in
      // createdCount.
      stockInFailures: { rowNumber: number; name: string; reason: string }[];
    }
> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }
  if (rows.length === 0) return { error: "ไม่มีรายการให้นำเข้า" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const branch = await getOrCreateDefaultBranch();
  const supplierCache = new Map<string, string>();
  let createdCount = 0;
  const stockInFailures: { rowNumber: number; name: string; reason: string }[] = [];

  for (const row of rows) {
    // Defense in depth: re-check nothing created this name since preview
    // (e.g. a concurrent import) — skip that one row, don't fail the batch.
    const dup = await prisma.ingredient.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: { equals: row.name, mode: "insensitive" },
      },
    });
    if (dup) continue;

    let supplierId: string | null = null;
    if (row.supplierName) {
      const key = row.supplierName.toLowerCase();
      supplierId = supplierCache.get(key) ?? null;
      if (!supplierId) {
        const existingSupplier = await prisma.supplier.findFirst({
          where: {
            branchId: branch.id,
            deletedAt: null,
            name: { equals: row.supplierName, mode: "insensitive" },
          },
        });
        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          const created = await prisma.supplier.create({
            data: { branchId: branch.id, name: row.supplierName, createdBy: actor.id },
          });
          supplierId = created.id;
        }
        supplierCache.set(key, supplierId);
      }
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        branchId: branch.id,
        name: row.name,
        baseUnit: row.baseUnit,
        costPerUnit: row.costPerUnit,
        lowStockThreshold: row.lowStockThreshold,
        supplierId,
        createdBy: actor.id,
      },
    });

    if (row.purchaseUnitName && row.conversionFactor) {
      await prisma.unitConversion.create({
        data: {
          ingredientId: ingredient.id,
          purchaseUnitName: row.purchaseUnitName,
          conversionFactor: row.conversionFactor,
        },
      });
    }

    if (row.startingStock > 0) {
      const stockInResult = await recordStockIn({
        ingredientId: ingredient.id,
        quantity: row.startingStock,
        note: "นำเข้าข้อมูลเริ่มต้นจากไฟล์",
      });
      // recordStockIn returns { error } rather than throwing (missing actor,
      // its own separate stock_in permission check, or schema validation).
      // The Ingredient row above is already committed and can't be cleanly
      // rolled back without wrapping this whole loop in a transaction (out
      // of scope here), but we must not let createdCount claim this row
      // fully succeeded when the "starting stock > 0 creates a real
      // stock_in ledger movement" constraint didn't actually hold — track
      // it distinctly instead of silently reporting success.
      //
      // Narrowing note: recordStockIn (features/inventory/actions/inventory.ts)
      // has no explicit return type annotation, so TS's inferred return type
      // does not narrow cleanly on `"error" in stockInResult` (a known gap —
      // see the identical comment in features/settings/actions/company-settings.ts
      // above requireSettingsAccess). Checking for the absence of `success`
      // narrows correctly without needing to touch that other file.
      if (!("success" in stockInResult)) {
        stockInFailures.push({
          rowNumber: row.rowNumber,
          name: row.name,
          reason: stockInResult.error,
        });
        continue;
      }
    }

    createdCount += 1;
  }

  return { success: true, createdCount, stockInFailures };
}

const BASE_UNIT_EXPORT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

interface IngredientExportRow {
  name: string;
  baseUnit: string;
  costPerUnit: string;
  startingStock: string;
  lowStockThreshold: string;
  supplierName: string;
  purchaseUnitName: string;
  conversionFactor: string;
}

export async function exportIngredients(
  format: "xlsx" | "csv",
): Promise<{ error: string } | { success: true; fileBase64: string; filename: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการวัตถุดิบ") };
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    include: { supplier: true, unitConversions: true },
    orderBy: { name: "asc" },
  });

  const rows: IngredientExportRow[] = ingredients.map((i) => ({
    name: i.name,
    baseUnit: BASE_UNIT_EXPORT_LABELS[i.baseUnit] ?? i.baseUnit,
    costPerUnit: i.costPerUnit.toString(),
    startingStock: i.currentStockQty.toString(),
    lowStockThreshold: i.lowStockThreshold?.toString() ?? "",
    supplierName: i.supplier?.name ?? "",
    // Deliberate limitation, not an oversight: INGREDIENT_IMPORT_COLUMNS (Task 2)
    // has exactly one purchaseUnitName/conversionFactor column pair, matching the
    // plan's "one purchase-unit conversion per row, maximum" constraint, since
    // export must round-trip through the same column schema as import. An
    // ingredient with 2+ UnitConversion rows (supported elsewhere via
    // unit-conversions-manager.tsx) only exports its first conversion here;
    // additional conversions are not represented in this file. Do not "fix"
    // this by adding more columns — that would exceed this task's scope and
    // the plan's constraint. If a full conversion list is ever needed, it
    // belongs in a different export/view, not this single-row-per-conversion
    // column pair.
    purchaseUnitName: i.unitConversions[0]?.purchaseUnitName ?? "",
    conversionFactor: i.unitConversions[0]?.conversionFactor.toString() ?? "",
  }));

  const columns: SpreadsheetColumn<IngredientExportRow>[] = [
    { key: "name", label: C.name },
    { key: "baseUnit", label: C.baseUnit },
    { key: "costPerUnit", label: C.costPerUnit },
    { key: "startingStock", label: C.startingStock },
    { key: "lowStockThreshold", label: C.lowStockThreshold },
    { key: "supplierName", label: C.supplierName },
    { key: "purchaseUnitName", label: C.purchaseUnitName },
    { key: "conversionFactor", label: C.conversionFactor },
  ];

  const buffer = buildSpreadsheet(rows, columns, format);
  return {
    success: true,
    fileBase64: buffer.toString("base64"),
    filename: `ingredients-export.${format}`,
  };
}
