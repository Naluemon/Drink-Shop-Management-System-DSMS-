import { z } from "zod";

// FR-INV-01: stock_in — "ผูกกับ Purchase Order เสมอ" ตามเอกสาร แต่ Purchase
// (Phase 7) ยังไม่ถูกสร้าง จึงยังไม่มี PO จริงให้ผูก ใช้ note อิสระไปก่อน
// จนกว่า Phase 7 จะเพิ่ม purchaseOrderItemId ให้เป็น reference จริง
export const stockInSchema = z.object({
  ingredientId: z.string().min(1, "กรุณาเลือกวัตถุดิบ"),
  quantity: z.coerce.number().positive("จำนวนต้องมากกว่า 0"),
  note: z.string().optional(),
});

export type StockInInput = z.infer<typeof stockInSchema>;

// FR-INV-02 / DECISIONS.md D12: reason_code บังคับสำหรับ stock_out เสมอ
// (Employee/Shift Supervisor ต้องมีเอกสารอ้างอิงเสมอ ตาม D14). Phase 12 /
// FR-SET-05: the actual valid-code list is DB-backed (ReasonCode table,
// managed in Settings) and checked server-side in recordStockOut — this
// schema only guards against an empty submission.
export const stockOutSchema = z.object({
  ingredientId: z.string().min(1, "กรุณาเลือกวัตถุดิบ"),
  quantity: z.coerce.number().positive("จำนวนต้องมากกว่า 0"),
  reasonCode: z.string().min(1, "กรุณาเลือกเหตุผล"),
});

export type StockOutInput = z.infer<typeof stockOutSchema>;

// FR-INV-03 / DECISIONS.md D12: adjustment แก้ตัวเลขอิสระ ไม่มีเอกสารอ้างอิง
// — จำกัดเฉพาะ Manager/Owner (เช็คใน requirePermission ของ action)
export const adjustmentSchema = z.object({
  ingredientId: z.string().min(1, "กรุณาเลือกวัตถุดิบ"),
  delta: z.coerce.number().refine((v) => v !== 0, "จำนวนต้องไม่เป็นศูนย์"),
  note: z.string().optional(),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
