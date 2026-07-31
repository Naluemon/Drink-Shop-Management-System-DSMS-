import { z } from "zod";

// Single source of truth for the column headers used by import parsing,
// export, and the downloadable template.
export const MENU_IMPORT_COLUMNS = {
  name: "ชื่อเมนู",
  categoryName: "หมวดหมู่",
  categoryType: "ประเภทหมวดหมู่",
  recipeName: "ชื่อสูตร",
  basePrice: "ราคาเริ่มต้น",
  imageUrl: "รูปภาพ (URL)",
  isAvailable: "เปิดขาย",
} as const;

const CATEGORY_TYPE_ALIASES: Record<string, "food" | "drink"> = {
  food: "food",
  อาหาร: "food",
  drink: "drink",
  เครื่องดื่ม: "drink",
};

function normalizeCategoryType(value: unknown): "food" | "drink" | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return CATEGORY_TYPE_ALIASES[trimmed] ?? CATEGORY_TYPE_ALIASES[trimmed.toLowerCase()];
}

function normalizeIsAvailable(value: unknown): boolean {
  if (typeof value !== "string") return true; // blank cell — default to available
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return true;
  return !["ไม่ใช่", "ไม่", "no", "false", "0"].includes(trimmed);
}

function emptyToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// One raw row of the file — pure shape validation only; whether the recipe
// name actually exists is checked in validate-import.ts, which has the
// DB-fetched recipe list this schema-only layer doesn't.
export const menuImportRowSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อเมนู"),
  categoryName: z.unknown().transform(emptyToUndefined),
  categoryType: z.unknown().transform(normalizeCategoryType),
  recipeName: z.string().trim().min(1, "กรุณากรอกชื่อสูตร"),
  basePrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  imageUrl: z
    .unknown()
    .transform(emptyToUndefined)
    .pipe(z.string().url("URL รูปภาพไม่ถูกต้อง").optional()),
  isAvailable: z.unknown().transform(normalizeIsAvailable),
});

export type MenuImportRowParsed = z.infer<typeof menuImportRowSchema>;
