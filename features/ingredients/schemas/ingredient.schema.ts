import { z } from "zod";

// DECISIONS.md D2: base_unit is exactly these 3 values, fixed once set
export const ingredientSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อวัตถุดิบ"),
  baseUnit: z.enum(["gram", "ml", "piece"], { message: "กรุณาเลือกหน่วยฐาน" }),
  // DECISIONS.md D1 / FR-ING-05: ก่อนมี PO แรก อนุญาตกรอก cost_per_unit มือ
  costPerUnit: z.coerce.number().min(0, "ต้นทุนต้องไม่ติดลบ"),
  lowStockThreshold: z.coerce.number().min(0).optional().or(z.literal("")),
  supplierId: z.string().optional().or(z.literal("")),
});

export type IngredientInput = z.infer<typeof ingredientSchema>;

// DECISIONS.md D2: purchase_unit -> base_unit conversion, many per ingredient
export const unitConversionSchema = z.object({
  purchaseUnitName: z.string().min(1, "กรุณาระบุชื่อหน่วยซื้อ"),
  conversionFactor: z.coerce.number().positive("อัตราแปลงหน่วยต้องมากกว่า 0"),
});

export type UnitConversionInput = z.infer<typeof unitConversionSchema>;
