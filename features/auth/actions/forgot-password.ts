"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
});

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string;

  const result = forgotPasswordSchema.safeParse({ email });
  if (!result.success) {
    return { error: "อีเมลไม่ถูกต้อง" };
  }

  const supabase = await createClient();

  // เหมือน Google OAuth: Supabase ส่งลิงก์แบบ PKCE (?code=) ต้องแลก session ผ่าน
  // /api/auth/callback ก่อน (ผู้ใช้มี dbUser อยู่แล้วจึงผ่านไปหน้า next ได้ทันที)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: error.message || "การส่งอีเมลรีเซ็ตรหัสผ่านล้มเหลว" };
  }

  // ส่งคืน success แม้ว่าอีเมลจะไม่มีอยู่จริงก็ตาม (เพื่อความปลอดภัย - ไม่เปิดเผยว่าอีเมลมีในระบบหรือไม่)
  return {
    success: true,
    message: "หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้คุณ",
  };
}

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .regex(/\d/, "รหัสผ่านต้องผสมตัวเลข"), // DECISIONS.md D13
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirmPassword"],
  });

export async function resetPassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const result = resetPasswordSchema.safeParse({ password, confirmPassword });
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message || "การรีเซ็ตรหัสผ่านล้มเหลว" };
  }

  return {
    success: true,
    message: "รีเซ็ตรหัสผ่านสำเร็จ กรุณาล็อกอินใหม่",
  };
}
