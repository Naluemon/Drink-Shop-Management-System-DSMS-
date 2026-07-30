import type { BaseUnit } from "@/lib/generated/prisma/enums";
import {
  INGREDIENT_IMPORT_COLUMNS,
  ingredientImportRowSchema,
} from "../schemas/ingredient-import.schema";

export interface ParsedIngredientRow {
  rowNumber: number;
  name: string;
  baseUnit: BaseUnit;
  costPerUnit: number;
  startingStock: number;
  lowStockThreshold: number | null;
  supplierName: string | null;
  purchaseUnitName: string | null;
  conversionFactor: number | null;
}

export interface ValidateImportResult {
  toCreate: ParsedIngredientRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

// Pure — no Prisma, no I/O — so it's testable without mocking the database.
// existingNames must already be lower-cased.
export function validateImportRows(
  rawRows: Record<string, unknown>[],
  existingNames: Set<string>,
): ValidateImportResult {
  const toCreate: ParsedIngredientRow[] = [];
  const duplicates: { rowNumber: number; name: string }[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];
  const seenInFile = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped = {
      name: raw[INGREDIENT_IMPORT_COLUMNS.name],
      baseUnit: raw[INGREDIENT_IMPORT_COLUMNS.baseUnit],
      costPerUnit: raw[INGREDIENT_IMPORT_COLUMNS.costPerUnit],
      startingStock: raw[INGREDIENT_IMPORT_COLUMNS.startingStock],
      lowStockThreshold: raw[INGREDIENT_IMPORT_COLUMNS.lowStockThreshold],
      supplierName: raw[INGREDIENT_IMPORT_COLUMNS.supplierName],
      purchaseUnitName: raw[INGREDIENT_IMPORT_COLUMNS.purchaseUnitName],
      conversionFactor: raw[INGREDIENT_IMPORT_COLUMNS.conversionFactor],
    };

    const result = ingredientImportRowSchema.safeParse(mapped);
    if (!result.success) {
      errors.push({ rowNumber, reason: result.error.issues[0].message });
      return;
    }

    const lowerName = result.data.name.toLowerCase();
    if (existingNames.has(lowerName) || seenInFile.has(lowerName)) {
      duplicates.push({ rowNumber, name: result.data.name });
      return;
    }
    seenInFile.add(lowerName);

    toCreate.push({
      rowNumber,
      name: result.data.name,
      baseUnit: result.data.baseUnit,
      costPerUnit: result.data.costPerUnit,
      startingStock: result.data.startingStock ?? 0,
      lowStockThreshold: result.data.lowStockThreshold ?? null,
      supplierName: result.data.supplierName ?? null,
      purchaseUnitName: result.data.purchaseUnitName ?? null,
      conversionFactor: result.data.conversionFactor ?? null,
    });
  });

  return { toCreate, duplicates, errors };
}
