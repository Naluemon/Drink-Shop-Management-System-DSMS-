import { z } from "zod";
import { UserRole } from "@/lib/generated/prisma/enums";

export const inviteSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  role: z.nativeEnum(UserRole, {
    message: "สิทธิ์การใช้งานไม่ถูกต้อง",
  }),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string(),
    password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .regex(/\d/, "รหัสผ่านต้องผสมตัวเลข"), // DECISIONS.md D13
    confirmPassword: z.string(),
    acceptPdpa: z.boolean().refine((val) => val === true, {
      message: "ต้องยอมรับเงื่อนไขนโยบายความเป็นส่วนตัว",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirmPassword"],
  });

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
