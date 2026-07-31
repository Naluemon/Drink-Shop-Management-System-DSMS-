import { z } from "zod";
import type { BaseUnit } from "@/lib/generated/prisma/enums";

// Single source of truth for the column headers used by import parsing,
// export, and the downloadable template (Task 5) — keeping all three in
// exactly one place means they can never drift out of sync with each other.
export const INGREDIENT_IMPORT_COLUMNS = {
  name: "ชื่อวัตถุดิบ",
  baseUnit: "หน่วยฐาน",
  costPerUnit: "ต้นทุนต่อหน่วย",
  startingStock: "สต็อกเริ่มต้น",
  lowStockThreshold: "จุดแจ้งเตือนสต็อกต่ำ",
  supplierName: "ผู้จำหน่าย",
  purchaseUnitName: "ชื่อหน่วยซื้อ",
  conversionFactor: "อัตราแปลงหน่วยซื้อ",
} as const;

// Accepts either the raw BaseUnit enum value or the Thai label already shown
// in the ingredient form (features/ingredients/components/ingredient-form-dialog.tsx's
// BASE_UNIT_OPTIONS) — a shop owner filling the template sees Thai labels,
// not "gram"/"ml"/"piece", and the template (Task 5) uses the Thai labels.
const BASE_UNIT_ALIASES: Record<string, BaseUnit> = {
  gram: "gram",
  กรัม: "gram",
  ml: "ml",
  "มล.": "ml",
  มล: "ml",
  piece: "piece",
  ชิ้น: "piece",
};

function normalizeBaseUnit(value: unknown): BaseUnit | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return BASE_UNIT_ALIASES[trimmed] ?? BASE_UNIT_ALIASES[trimmed.toLowerCase()];
}

function emptyToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// One parsed+validated row, ready to create — supplierName is still a raw
// name here (resolved to a Supplier id during commit, since that needs a DB
// round-trip this schema layer intentionally doesn't do).
export const ingredientImportRowSchema = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่อวัตถุดิบ"),
    baseUnit: z
      .unknown()
      .transform(normalizeBaseUnit)
      .refine((v): v is BaseUnit => v !== undefined, {
        message: "หน่วยฐานต้องเป็น กรัม / มล. / ชิ้น เท่านั้น",
      }),
    costPerUnit: z.coerce
      .number({ error: "ต้นทุนต่อหน่วยต้องเป็นตัวเลข" })
      .min(0, "ต้นทุนต้องไม่ติดลบ"),
    startingStock: z.coerce
      .number({ error: "สต็อกเริ่มต้นต้องเป็นตัวเลข" })
      .min(0, "สต็อกเริ่มต้นต้องไม่ติดลบ")
      .optional(),
    lowStockThreshold: z.coerce
      .number({ error: "จุดแจ้งเตือนต้องเป็นตัวเลข" })
      .min(0, "จุดแจ้งเตือนต้องไม่ติดลบ")
      .optional(),
    supplierName: z.unknown().transform(emptyToUndefined),
    purchaseUnitName: z.unknown().transform(emptyToUndefined),
    conversionFactor: z.coerce
      .number({ error: "อัตราแปลงหน่วยต้องเป็นตัวเลข" })
      .positive("อัตราแปลงหน่วยต้องมากกว่า 0")
      .optional(),
  })
  .refine((row) => (row.purchaseUnitName === undefined) === (row.conversionFactor === undefined), {
    message: "ต้องกรอกทั้งชื่อหน่วยซื้อและอัตราแปลงคู่กัน หรือไม่กรอกทั้งคู่",
    path: ["purchaseUnitName"],
  });

export type IngredientImportRowParsed = z.infer<typeof ingredientImportRowSchema>;

// commitIngredientImport (features/ingredients/actions/ingredient-import-export.ts)
// receives ParsedIngredientRow[] straight back from the browser — the client
// round-trips preview.toCreate from a prior previewIngredientImport call. That
// means a crafted/buggy request can hand the server any shape at all, even
// though TypeScript's ParsedIngredientRow type claims it's already validated.
// This schema re-checks the *parsed* shape's invariants (not the raw
// spreadsheet-cell shape ingredientImportRowSchema validates — this one
// expects already-typed/coerced fields like baseUnit: BaseUnit and
// costPerUnit: number, not raw unknown cells with Thai-label coercion) so
// commitIngredientImport can defensively re-validate each row before writing
// it, the same way previewIngredientImport validated it the first time.
export const parsedIngredientRowSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    name: z.string().trim().min(1),
    baseUnit: z.enum(["gram", "ml", "piece"]),
    costPerUnit: z.number().min(0),
    startingStock: z.number().min(0),
    lowStockThreshold: z.number().min(0).nullable(),
    supplierName: z.string().nullable(),
    purchaseUnitName: z.string().nullable(),
    conversionFactor: z.number().positive().nullable(),
  })
  .refine((row) => (row.purchaseUnitName === null) === (row.conversionFactor === null), {
    message: "ต้องกรอกทั้งชื่อหน่วยซื้อและอัตราแปลงคู่กัน หรือไม่กรอกทั้งคู่",
    path: ["purchaseUnitName"],
  });
