import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  // DECISIONS.md D13: อย่างน้อย 8 ตัวอักษร ผสมตัวเลข (ตรงกับ schema อื่นทั้งหมด)
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
});

export type LoginInput = z.infer<typeof loginSchema>;
