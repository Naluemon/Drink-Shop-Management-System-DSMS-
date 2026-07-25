import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อผู้จำหน่าย"),
  contactInfo: z.string().optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
