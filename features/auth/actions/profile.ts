"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateProfileSchema = z.object({
  fullName: z.string().min(1, "ชื่อจำเป็นต้องกรอก"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
});

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "ไม่ได้ล็อกอิน" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!dbUser) {
    return { error: "ไม่พบข้อมูลผู้ใช้" };
  }

  return { user: dbUser };
}

export async function updateProfile(formData: FormData) {
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;

  const result = updateProfileSchema.safeParse({ fullName, email });
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "ไม่ได้ล็อกอิน" };
  }

  // ตรวจสอบว่าอีเมลใหม่ไม่ซ้ำกับ user อื่น
  const existingUser = await prisma.user.findFirst({
    where: {
      email,
      id: { not: user.id },
    },
  });

  if (existingUser) {
    return { error: "อีเมลนี้มีผู้ใช้งานอยู่แล้ว" };
  }

  try {
    // อัปเดตใน Prisma
    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        email,
      },
    });

    // อัปเดตใน Supabase Auth (ถ้าอีเมลเปลี่ยน)
    if (email !== user.email) {
      const { error } = await supabase.auth.updateUser({
        email,
      });

      if (error) {
        return { error: error.message || "การอัปเดตอีเมลล้มเหลว" };
      }
    }

    return { success: true, message: "อัปเดตข้อมูลสำเร็จ" };
  } catch {
    return { error: "การอัปเดตข้อมูลล้มเหลว" };
  }
}

export async function changePassword(formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "รหัสผ่านไม่ตรงกัน" };
  }

  // DECISIONS.md D13: Password ขั้นต่ำ 8 ตัวอักษร ผสมตัวเลข
  if (newPassword.length < 8 || !/\d/.test(newPassword)) {
    return { error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "ไม่ได้ล็อกอิน" };
  }

  // ตรวจสอบรหัสผ่านปัจจุบัน
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });

  if (verifyError) {
    return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  // อัปเดตรหัสผ่าน
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message || "การเปลี่ยนรหัสผ่านล้มเหลว" };
  }

  return { success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" };
}
