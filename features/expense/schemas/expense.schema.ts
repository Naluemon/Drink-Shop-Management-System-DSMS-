import { z } from "zod";

// FR-EXP-01: expense category master list (Rent, Electricity, Salary, Misc, ...)
export const expenseCategorySchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อหมวดหมู่"),
});

export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

// FR-EXP-02: append-only expense entry, created_by tracked via actor
export const expenseEntrySchema = z.object({
  categoryId: z.string().min(1, "กรุณาเลือกหมวดหมู่"),
  amount: z.coerce.number().positive("จำนวนเงินต้องมากกว่า 0"),
  description: z.string().optional(),
});

export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;

// FR-EXP-03: แก้ไข/ลบ expense ทำผ่านรายการปรับปรุงใหม่เท่านั้น (ห้ามลบ record จริง)
// — delta ติดลบ = ลดยอด (รวมถึงยกเลิกทั้งจำนวนโดยใส่ -amount เดิม), delta บวก = เพิ่มยอด
export const expenseAdjustmentSchema = z.object({
  entryId: z.string().min(1),
  delta: z.coerce.number().refine((v) => v !== 0, "จำนวนต้องไม่เป็นศูนย์"),
  note: z.string().optional(),
});

export type ExpenseAdjustmentInput = z.infer<typeof expenseAdjustmentSchema>;
