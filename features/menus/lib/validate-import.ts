import { MENU_IMPORT_COLUMNS, menuImportRowSchema } from "../schemas/menu-import.schema";

export interface ParsedMenuRow {
  rowNumber: number;
  name: string;
  categoryName: string | null;
  categoryType: "food" | "drink" | null;
  recipeId: string;
  recipeName: string;
  basePrice: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface ValidateMenuImportResult {
  toCreate: ParsedMenuRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

// Pure — no Prisma, no I/O. Category resolution/creation happens at commit
// time (like supplier auto-create in the ingredient import), not here — a
// row only carries the raw category name/type through. existingRecipes and
// existingMenuNames keys must already be lower-cased.
export function validateMenuImportRows(
  rawRows: Record<string, unknown>[],
  existingMenuNames: Set<string>,
  existingRecipes: Map<string, string>,
): ValidateMenuImportResult {
  const normalizedExistingMenuNames = new Set([...existingMenuNames].map((n) => n.toLowerCase()));
  const normalizedExistingRecipes = new Map(
    [...existingRecipes.entries()].map(([name, id]) => [name.toLowerCase(), id]),
  );

  const toCreate: ParsedMenuRow[] = [];
  const duplicates: { rowNumber: number; name: string }[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];
  const seenInFile = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped = {
      name: raw[MENU_IMPORT_COLUMNS.name],
      categoryName: raw[MENU_IMPORT_COLUMNS.categoryName],
      categoryType: raw[MENU_IMPORT_COLUMNS.categoryType],
      recipeName: raw[MENU_IMPORT_COLUMNS.recipeName],
      basePrice: raw[MENU_IMPORT_COLUMNS.basePrice],
      imageUrl: raw[MENU_IMPORT_COLUMNS.imageUrl],
      isAvailable: raw[MENU_IMPORT_COLUMNS.isAvailable],
    };

    const result = menuImportRowSchema.safeParse(mapped);
    if (!result.success) {
      errors.push({ rowNumber, reason: result.error.issues[0].message });
      return;
    }

    const recipeId = normalizedExistingRecipes.get(result.data.recipeName.toLowerCase());
    if (!recipeId) {
      errors.push({ rowNumber, reason: `ไม่พบสูตร: ${result.data.recipeName}` });
      return;
    }

    const lowerName = result.data.name.toLowerCase();
    if (normalizedExistingMenuNames.has(lowerName) || seenInFile.has(lowerName)) {
      duplicates.push({ rowNumber, name: result.data.name });
      return;
    }
    seenInFile.add(lowerName);

    toCreate.push({
      rowNumber,
      name: result.data.name,
      categoryName: result.data.categoryName ?? null,
      categoryType: result.data.categoryType ?? null,
      recipeId,
      recipeName: result.data.recipeName,
      basePrice: result.data.basePrice,
      imageUrl: result.data.imageUrl ?? null,
      isAvailable: result.data.isAvailable,
    });
  });

  return { toCreate, duplicates, errors };
}
