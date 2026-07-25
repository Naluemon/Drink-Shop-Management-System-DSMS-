import { z } from "zod";

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "กรุณาเลือกผู้จำหน่าย"),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

// FR-PUR-02: เลือก ingredient + purchase_unit (ต้องมี unit_conversion อยู่แล้ว
// เพื่อให้แปลงเป็น base_unit ได้ตอน receive) + quantity + ราคา
export const purchaseOrderItemSchema = z.object({
  ingredientId: z.string().min(1, "กรุณาเลือกวัตถุดิบ"),
  purchaseUnitName: z.string().min(1, "กรุณาเลือกหน่วยซื้อ"),
  quantity: z.coerce.number().positive("จำนวนต้องมากกว่า 0"),
  unitPrice: z.coerce.number().positive("ราคาต้องมากกว่า 0"),
});

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;
