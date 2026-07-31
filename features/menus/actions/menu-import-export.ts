"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { parseSpreadsheet, buildSpreadsheet, type SpreadsheetColumn } from "@/lib/spreadsheet";
import { MENU_IMPORT_COLUMNS } from "../schemas/menu-import.schema";
import { validateMenuImportRows, type ParsedMenuRow } from "../lib/validate-import";

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
const C = MENU_IMPORT_COLUMNS;

// Same rationale as the ingredient/recipe import actions: buildSpreadsheet
// writes "" for a blank cell rather than omitting the key, which would
// otherwise coerce a blank optional numeric/enum field incorrectly.
function sanitizeRawRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" && value.trim() === "" ? undefined : value,
    ]),
  );
}

export interface PreviewMenuResult {
  toCreate: ParsedMenuRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

export async function previewMenuImport(
  fileBase64: string,
): Promise<{ error: string } | PreviewMenuResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างเมนู") };
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

  const [existingMenus, existingRecipes] = await Promise.all([
    prisma.menu.findMany({ where: { deletedAt: null }, select: { name: true } }),
    prisma.recipe.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const existingMenuNames = new Set(existingMenus.map((m) => m.name.toLowerCase()));
  const existingRecipeMap = new Map(existingRecipes.map((r) => [r.name.toLowerCase(), r.id]));

  return validateMenuImportRows(rawRows, existingMenuNames, existingRecipeMap);
}

// Re-validates the shape the client sends back to commit — see the
// ingredient-import equivalent's comment for why this can't be skipped.
const parsedMenuRowSchema = z.object({
  name: z.string().trim().min(1),
  categoryName: z.string().nullable(),
  categoryType: z.enum(["food", "drink"]).nullable(),
  recipeId: z.string().min(1),
  recipeName: z.string().min(1),
  basePrice: z.number().min(0),
  imageUrl: z.string().url().nullable(),
  isAvailable: z.boolean(),
});

export async function commitMenuImport(rows: ParsedMenuRow[]): Promise<
  | { error: string }
  | {
      success: true;
      createdCount: number;
      // Rows that failed re-validation, or whose recipe was deleted/menu
      // name taken by a concurrent import since preview — skipped before
      // ever reaching Prisma, not counted in createdCount.
      invalidRows: { name: string; reason: string }[];
    }
> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างเมนู") };
  }
  if (rows.length === 0) return { error: "ไม่มีรายการให้นำเข้า" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const categoryCache = new Map<string, string>();
  const invalidRows: { name: string; reason: string }[] = [];
  let createdCount = 0;

  for (const row of rows) {
    const parsed = parsedMenuRowSchema.safeParse(row);
    if (!parsed.success) {
      invalidRows.push({ name: row?.name ?? "?", reason: parsed.error.issues[0].message });
      continue;
    }

    const recipe = await prisma.recipe.findUnique({ where: { id: parsed.data.recipeId } });
    if (!recipe || recipe.deletedAt) {
      invalidRows.push({ name: parsed.data.name, reason: `ไม่พบสูตร: ${parsed.data.recipeName}` });
      continue;
    }

    // Defense in depth: re-check nothing created this name since preview.
    const dup = await prisma.menu.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
    });
    if (dup) {
      invalidRows.push({ name: parsed.data.name, reason: "มีเมนูชื่อนี้อยู่แล้ว" });
      continue;
    }

    let categoryId: string | null = null;
    if (parsed.data.categoryName) {
      const key = parsed.data.categoryName.toLowerCase();
      categoryId = categoryCache.get(key) ?? null;
      if (!categoryId) {
        const existingCategory = await prisma.menuCategory.findFirst({
          where: {
            branchId: branch.id,
            deletedAt: null,
            name: { equals: parsed.data.categoryName, mode: "insensitive" },
          },
        });
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const created = await prisma.menuCategory.create({
            data: {
              branchId: branch.id,
              name: parsed.data.categoryName,
              type: parsed.data.categoryType ?? "drink",
              createdBy: actor.id,
            },
          });
          categoryId = created.id;
        }
        categoryCache.set(key, categoryId);
      }
    }

    await prisma.menu.create({
      data: {
        branchId: branch.id,
        name: parsed.data.name,
        recipeId: parsed.data.recipeId,
        categoryId,
        basePrice: parsed.data.basePrice,
        imageUrl: parsed.data.imageUrl,
        isAvailable: parsed.data.isAvailable,
        createdBy: actor.id,
      },
    });

    createdCount += 1;
  }

  return { success: true, createdCount, invalidRows };
}

const CATEGORY_TYPE_EXPORT_LABELS: Record<string, string> = { food: "อาหาร", drink: "เครื่องดื่ม" };

interface MenuExportRow {
  name: string;
  categoryName: string;
  categoryType: string;
  recipeName: string;
  basePrice: string;
  imageUrl: string;
  isAvailable: string;
}

export async function exportMenus(
  format: "xlsx" | "csv",
): Promise<{ error: string } | { success: true; fileBase64: string; filename: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูเมนู") };
  }

  const menus = await prisma.menu.findMany({
    where: { deletedAt: null },
    include: { category: true, recipe: true },
    orderBy: { name: "asc" },
  });

  const rows: MenuExportRow[] = menus.map((m) => ({
    name: m.name,
    categoryName: m.category?.name ?? "",
    categoryType: m.category ? (CATEGORY_TYPE_EXPORT_LABELS[m.category.type] ?? "") : "",
    recipeName: m.recipe.name,
    basePrice: m.basePrice.toString(),
    imageUrl: m.imageUrl ?? "",
    isAvailable: m.isAvailable ? "ใช่" : "ไม่ใช่",
  }));

  const columns: SpreadsheetColumn<MenuExportRow>[] = [
    { key: "name", label: C.name },
    { key: "categoryName", label: C.categoryName },
    { key: "categoryType", label: C.categoryType },
    { key: "recipeName", label: C.recipeName },
    { key: "basePrice", label: C.basePrice },
    { key: "imageUrl", label: C.imageUrl },
    { key: "isAvailable", label: C.isAvailable },
  ];

  const buffer = buildSpreadsheet(rows, columns, format);
  return {
    success: true,
    fileBase64: buffer.toString("base64"),
    filename: `menus-export.${format}`,
  };
}
