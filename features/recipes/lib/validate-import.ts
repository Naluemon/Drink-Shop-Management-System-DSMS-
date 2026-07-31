import { RECIPE_IMPORT_COLUMNS, recipeImportRowSchema } from "../schemas/recipe-import.schema";

export interface ParsedRecipeIngredientLine {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  quantity: number;
}

export interface ParsedRecipe {
  name: string;
  yield: number;
  ingredients: ParsedRecipeIngredientLine[];
}

export interface ValidateRecipeImportResult {
  toCreate: ParsedRecipe[];
  duplicates: { name: string }[];
  errors: { recipeName: string; rowNumber: number; reason: string }[];
}

interface ExistingIngredient {
  id: string;
  baseUnit: string;
}

interface RowGroup {
  displayName: string;
  firstRowNumber: number;
  lines: { rowNumber: number; ingredientName: string; quantity: number }[];
  yieldValue: number | null;
  error: { rowNumber: number; reason: string } | null;
}

// Pure — no Prisma, no I/O. One row = one recipe-ingredient line; rows
// sharing the same (case-insensitive) recipe name are grouped into a
// single recipe. existingIngredients keys must already be lower-cased;
// existingRecipeNames likewise.
export function validateRecipeImportRows(
  rawRows: Record<string, unknown>[],
  existingRecipeNames: Set<string>,
  existingIngredients: Map<string, ExistingIngredient>,
): ValidateRecipeImportResult {
  const normalizedExistingRecipeNames = new Set(
    [...existingRecipeNames].map((n) => n.toLowerCase()),
  );
  const normalizedExistingIngredients = new Map(
    [...existingIngredients.entries()].map(([name, v]) => [name.toLowerCase(), v]),
  );

  const groups = new Map<string, RowGroup>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const rawRecipeName = raw[RECIPE_IMPORT_COLUMNS.recipeName];
    const trimmedName = typeof rawRecipeName === "string" ? rawRecipeName.trim() : "";
    const groupKey = trimmedName === "" ? `__row_${rowNumber}` : trimmedName.toLowerCase();

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        displayName: trimmedName === "" ? `(แถวที่ ${rowNumber})` : trimmedName,
        firstRowNumber: rowNumber,
        lines: [],
        yieldValue: null,
        error: null,
      });
    }
    const group = groups.get(groupKey)!;
    if (group.error) return; // group already failed on an earlier row

    const parsed = recipeImportRowSchema.safeParse({
      recipeName: rawRecipeName,
      yield: raw[RECIPE_IMPORT_COLUMNS.yield],
      ingredientName: raw[RECIPE_IMPORT_COLUMNS.ingredientName],
      quantity: raw[RECIPE_IMPORT_COLUMNS.quantity],
    });
    if (!parsed.success) {
      group.error = { rowNumber, reason: parsed.error.issues[0].message };
      return;
    }

    if (group.yieldValue === null) group.yieldValue = parsed.data.yield;

    const ingredient = normalizedExistingIngredients.get(parsed.data.ingredientName.toLowerCase());
    if (!ingredient) {
      group.error = { rowNumber, reason: `ไม่พบวัตถุดิบ: ${parsed.data.ingredientName}` };
      return;
    }

    group.lines.push({
      rowNumber,
      ingredientName: parsed.data.ingredientName,
      quantity: parsed.data.quantity,
    });
  });

  const toCreate: ParsedRecipe[] = [];
  const duplicates: { name: string }[] = [];
  const errors: { recipeName: string; rowNumber: number; reason: string }[] = [];

  for (const group of groups.values()) {
    if (group.error) {
      errors.push({
        recipeName: group.displayName,
        rowNumber: group.error.rowNumber,
        reason: group.error.reason,
      });
      continue;
    }
    if (normalizedExistingRecipeNames.has(group.displayName.toLowerCase())) {
      duplicates.push({ name: group.displayName });
      continue;
    }

    toCreate.push({
      name: group.displayName,
      yield: group.yieldValue!,
      ingredients: group.lines.map((line) => {
        const ingredient = normalizedExistingIngredients.get(line.ingredientName.toLowerCase())!;
        return {
          ingredientId: ingredient.id,
          ingredientName: line.ingredientName,
          baseUnit: ingredient.baseUnit,
          quantity: line.quantity,
        };
      }),
    });
  }

  return { toCreate, duplicates, errors };
}
