import { z } from "zod";

// Single source of truth for the column headers used by import parsing,
// export, and the downloadable template — one row per recipe-ingredient
// line; consecutive/scattered rows sharing the same "ชื่อสูตร" are grouped
// into one recipe (see lib/validate-import.ts).
export const RECIPE_IMPORT_COLUMNS = {
  recipeName: "ชื่อสูตร",
  yield: "ผลผลิต",
  ingredientName: "ชื่อวัตถุดิบ",
  quantity: "ปริมาณ",
} as const;

// One raw row of the file — pure shape validation only; whether the
// ingredient name actually exists is checked in validate-import.ts, which
// has the DB-fetched ingredient list this schema-only layer doesn't.
export const recipeImportRowSchema = z.object({
  recipeName: z.string().trim().min(1, "กรุณากรอกชื่อสูตร"),
  yield: z.coerce.number().positive("ผลผลิตต้องมากกว่า 0"),
  ingredientName: z.string().trim().min(1, "กรุณากรอกชื่อวัตถุดิบ"),
  quantity: z.coerce.number().positive("ปริมาณต้องมากกว่า 0"),
});

export type RecipeImportRowParsed = z.infer<typeof recipeImportRowSchema>;
