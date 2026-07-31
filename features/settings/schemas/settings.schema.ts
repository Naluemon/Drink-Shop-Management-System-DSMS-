import { z } from "zod";

// FR-SET-01 / DECISIONS.md D16: registeredName/registeredAddress double as
// general "company info" for every receipt, not only the formal tax invoice
export const companyInfoSchema = z
  .object({
    registeredName: z.string().optional(),
    registeredAddress: z.string().optional(),
    companyPhone: z.string().optional(),
    isVatRegistered: z.coerce.boolean(),
    taxId: z.string().optional(),
  })
  .refine((data) => !data.isVatRegistered || /^\d{13}$/.test(data.taxId ?? ""), {
    message: "กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก เมื่อจดทะเบียน VAT (D16)",
    path: ["taxId"],
  });

export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;

// FR-SET-02 / DECISIONS.md D9
export const taxSettingsSchema = z.object({
  vatMode: z.enum(["inclusive", "exclusive", "none"], { message: "กรุณาเลือกรูปแบบ VAT" }),
  vatRate: z.coerce.number().min(0, "อัตราภาษีต้องไม่ติดลบ").max(100, "อัตราภาษีต้องไม่เกิน 100%"),
});

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;

// FR-SET-01
export const receiptSettingsSchema = z.object({
  receiptFooterMessage: z.string().optional(),
  receiptPaperWidth: z.enum(["mm58", "mm80"], { message: "กรุณาเลือกขนาดกระดาษ" }),
});

export type ReceiptSettingsInput = z.infer<typeof receiptSettingsSchema>;

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "รูปแบบเวลาต้องเป็น HH:MM")
  .optional()
  .or(z.literal(""));

// FR-SET-03 / DECISIONS.md D8
export const businessHoursSchema = z.object({
  openTime: timeStringSchema,
  closeTime: timeStringSchema,
  timezone: z.string().min(1, "กรุณาระบุ timezone"),
  businessDayStartHour: z.coerce.number().int().min(0).max(23),
});

export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;

const stockDeficitPolicyEnum = z.enum(["warn_only", "strict_block"]);

// FR-SET-04 / DECISIONS.md D4 — global default
export const stockDeficitPolicySchema = z.object({
  stockDeficitPolicy: stockDeficitPolicyEnum,
});

export type StockDeficitPolicyInput = z.infer<typeof stockDeficitPolicySchema>;

// FR-SET-04 / DECISIONS.md D4 — per-ingredient override ("default" = clear override, follow global)
export const ingredientDeficitOverrideSchema = z.object({
  ingredientId: z.string().min(1),
  override: z.enum(["warn_only", "strict_block", "default"]),
});

export type IngredientDeficitOverrideInput = z.infer<typeof ingredientDeficitOverrideSchema>;

// FR-SET-05 / DECISIONS.md D12 review trigger
export const reasonCodeSchema = z.object({
  code: z
    .string()
    .min(1, "กรุณากรอกรหัส")
    .regex(/^[a-z0-9_]+$/, "ใช้ตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข และ _ เท่านั้น"),
  label: z.string().min(1, "กรุณากรอกชื่อที่แสดง"),
});

export type ReasonCodeInput = z.infer<typeof reasonCodeSchema>;

export const reasonCodeUpdateSchema = z.object({
  label: z.string().min(1, "กรุณากรอกชื่อที่แสดง"),
  isActive: z.coerce.boolean(),
});

export type ReasonCodeUpdateInput = z.infer<typeof reasonCodeUpdateSchema>;

import { PAGE_KEYS } from "@/lib/page-access";

const NON_OWNER_ROLE_VALUES = [
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
] as const;

export const rolePagePermissionUpdateSchema = z.object({
  changes: z
    .array(
      z.object({
        role: z.enum(NON_OWNER_ROLE_VALUES),
        pageKey: z.enum(PAGE_KEYS),
        allowed: z.coerce.boolean(),
      }),
    )
    .min(1, "ไม่มีการเปลี่ยนแปลง"),
});

export type RolePagePermissionUpdateInput = z.infer<typeof rolePagePermissionUpdateSchema>;
