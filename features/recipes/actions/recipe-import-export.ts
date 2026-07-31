"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { parseSpreadsheet, buildSpreadsheet, type SpreadsheetColumn } from "@/lib/spreadsheet";
import { RECIPE_IMPORT_COLUMNS } from "../schemas/recipe-import.schema";
import { validateRecipeImportRows, type ParsedRecipe } from "../lib/validate-import";

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
const C = RECIPE_IMPORT_COLUMNS;

// Same rationale as features/ingredients/actions/ingredient-import-export.ts:
// buildSpreadsheet writes "" for a blank cell rather than omitting the key.
// recipeImportRowSchema's fields are all required (not optional) here, so a
// blank cell already fails validation correctly without this — kept for
// consistency with the ingredient import path and in case a future column
// becomes optional.
function sanitizeRawRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" && value.trim() === "" ? undefined : value,
    ]),
  );
}

export interface PreviewRecipeResult {
  toCreate: ParsedRecipe[];
  duplicates: { name: string }[];
  errors: { recipeName: string; rowNumber: number; reason: string }[];
}

export async function previewRecipeImport(
  fileBase64: string,
): Promise<{ error: string } | PreviewRecipeResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างสูตร") };
  }

  const buffer = Buffer.from(fileBase64, "base64");
  let rawRows: Record<string, unknown>[];
  try {
    rawRows = parseSpreadsheet(buffer).map(sanitizeRawRow);
  } catch {
    return { error: "ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx หรือ .csv ที่ถูกต้อง" };
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const [existingRecipes, existingIngredients] = await Promise.all([
    prisma.recipe.findMany({ where: { deletedAt: null }, select: { name: true } }),
    prisma.ingredient.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, baseUnit: true },
    }),
  ]);

  const existingRecipeNames = new Set(existingRecipes.map((r) => r.name.toLowerCase()));
  const existingIngredientMap = new Map(
    existingIngredients.map((i) => [i.name.toLowerCase(), { id: i.id, baseUnit: i.baseUnit }]),
  );

  return validateRecipeImportRows(rawRows, existingRecipeNames, existingIngredientMap);
}

// Re-validates the shape the client sends back to commit — see the
// ingredient-import equivalent's comment for why this can't be skipped:
// commitRecipeImport must not trust client-supplied data wholesale.
const parsedRecipeSchema = z.object({
  name: z.string().trim().min(1),
  yield: z.number().positive(),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        ingredientName: z.string().min(1),
        baseUnit: z.string().min(1),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});

export async function commitRecipeImport(rows: ParsedRecipe[]): Promise<
  | { error: string }
  | {
      success: true;
      createdCount: number;
      // Rows that failed re-validation, or whose recipe name was already
      // taken by the time commit ran (a concurrent import) — skipped before
      // ever reaching Prisma, not counted in createdCount.
      invalidRows: { name: string; reason: string }[];
    }
> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างสูตร") };
  }
  if (rows.length === 0) return { error: "ไม่มีรายการให้นำเข้า" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const invalidRows: { name: string; reason: string }[] = [];
  let createdCount = 0;

  for (const row of rows) {
    const parsed = parsedRecipeSchema.safeParse(row);
    if (!parsed.success) {
      invalidRows.push({ name: row?.name ?? "?", reason: parsed.error.issues[0].message });
      continue;
    }

    // Defense in depth: re-check nothing created this name since preview.
    const dup = await prisma.recipe.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
    });
    if (dup) {
      invalidRows.push({ name: parsed.data.name, reason: "มีสูตรชื่อนี้อยู่แล้ว" });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          branchId: branch.id,
          name: parsed.data.name,
          yield: parsed.data.yield,
          createdBy: actor.id,
        },
      });
      await tx.recipeIngredient.createMany({
        data: parsed.data.ingredients.map((ing) => ({
          recipeId: recipe.id,
          ingredientId: ing.ingredientId,
          quantity: ing.quantity,
        })),
      });
    });

    createdCount += 1;
  }

  return { success: true, createdCount, invalidRows };
}

interface RecipeExportRow {
  recipeName: string;
  yield: string;
  ingredientName: string;
  quantity: string;
}

export async function exportRecipes(
  format: "xlsx" | "csv",
): Promise<{ error: string } | { success: true; fileBase64: string; filename: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสูตร") };
  }

  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null },
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { name: "asc" },
  });

  // A recipe with zero ingredient lines has nothing to round-trip through
  // this one-row-per-ingredient format — skip it rather than emit a row
  // that would fail re-import (an empty ingredient name/quantity).
  const rows: RecipeExportRow[] = recipes.flatMap((r) =>
    r.ingredients.map((ri) => ({
      recipeName: r.name,
      yield: r.yield.toString(),
      ingredientName: ri.ingredient.name,
      quantity: ri.quantity.toString(),
    })),
  );

  const columns: SpreadsheetColumn<RecipeExportRow>[] = [
    { key: "recipeName", label: C.recipeName },
    { key: "yield", label: C.yield },
    { key: "ingredientName", label: C.ingredientName },
    { key: "quantity", label: C.quantity },
  ];

  const buffer = buildSpreadsheet(rows, columns, format);
  return {
    success: true,
    fileBase64: buffer.toString("base64"),
    filename: `recipes-export.${format}`,
  };
}
