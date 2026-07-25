"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loginSchema } from "../schemas/login.schema";
import { prisma } from "@/lib/prisma";
import { isAccountLocked, incrementFailedLogin, resetFailedLogin } from "@/lib/auth-utils";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const result = loginSchema.safeParse({ email, password });
  if (!result.success) {
    redirect(`/login?error=${encodeURIComponent("ข้อมูลไม่ถูกต้อง")}`);
  }

  const supabase = await createClient();

  // ตรวจสอบว่าอีเมลมีในระบบหรือไม่
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง")}`);
  }

  // ตรวจสอบว่า user ยัง active อยู่หรือไม่
  if (!user.isActive) {
    redirect(`/login?error=${encodeURIComponent("บัญชีนี้ถูกระงับการใช้งาน")}`);
  }

  // ตรวจสอบว่าบัญชีถูกล็อกอยู่หรือไม่
  if (await isAccountLocked(user.id)) {
    redirect(`/login?error=${encodeURIComponent("บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ใน 15 นาที")}`);
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // เพิ่มจำนวนครั้งที่ล็อกอินผิด
    await incrementFailedLogin(user.id);
    redirect(`/login?error=${encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง")}`);
  }

  if (authData.user) {
    // รีเซ็ตจำนวนครั้งที่ล็อกอินผิด
    await resetFailedLogin(user.id);
  }

  redirect("/dashboard");
}
