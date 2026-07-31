"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, InviteInput, acceptInviteSchema } from "../schemas/invite.schema";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { requirePermission, canInviteRole, PermissionError } from "@/lib/permissions";

// DECISIONS.md D6, D14: Owner/Manager ส่ง invite ได้
// Manager invite ได้เฉพาะ Shift Supervisor/Cashier/Employee (ห้าม invite Accountant)
export async function createInvite(input: InviteInput) {
  const result = inviteSchema.safeParse(input);
  if (!result.success) {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "กรุณาล็อกอินก่อน" };
  }

  const inviter = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!inviter) {
    return { error: "ไม่พบข้อมูลผู้ใช้" };
  }

  try {
    requirePermission(inviter.role, "invite", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ส่งคำเชิญ" };
    throw e;
  }

  // DECISIONS.md D14: Manager invite ได้เฉพาะ Shift Supervisor/Cashier/Employee
  if (!canInviteRole(inviter.role, input.role)) {
    return { error: "คุณไม่มีสิทธิ์ invite บทบาทนี้" };
  }

  // ตรวจสอบว่าอีเมลนี้มี invite ที่ยังไม่หมดอายุอยู่แล้วหรือไม่
  const existingInvite = await prisma.userInvite.findFirst({
    where: {
      email: input.email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingInvite) {
    return { error: "อีเมลนี้มีคำเชิญที่ยังใช้งานได้อยู่แล้ว" };
  }

  // ตรวจสอบว่าอีเมลนี้มี user อยู่แล้วหรือไม่
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    return { error: "อีเมลนี้มีผู้ใช้งานอยู่แล้ว" };
  }

  // สร้าง token แบบสุ่ม
  const token = crypto.randomBytes(32).toString("hex");

  // Invite หมดอายุใน 7 วัน
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  try {
    await prisma.userInvite.create({
      data: {
        organizationId: inviter.organizationId,
        email: input.email,
        role: input.role,
        invitedById: user.id,
        token,
        expiresAt,
      },
    });

    // TODO: ส่งอีเมลจริง (ต้อง implement email service ใน Phase ถัดไป)
    // ตอนนี้คืนค่า token เพื่อให้สามารถสร้างลิงก์ invite ได้ใน development
    return {
      success: true,
      token,
      inviteLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/invite/accept?token=${token}`,
    };
  } catch {
    return { error: "การสร้างคำเชิญล้มเหลว" };
  }
}

// รายการคำเชิญที่ยังไม่หมดอายุและยังไม่มีคนกดรับ — เดิมลิงก์เชิญโชว์ครั้งเดียวใน
// dialog ตอนสร้างเท่านั้น ถ้าปิดหน้าไปโดยยังไม่ได้คัดลอกก็กู้คืนไม่ได้เลย ต้องมาดูซ้ำที่นี่
// Owner เห็นคำเชิญทั้งหมดของร้าน ส่วน Manager เห็นเฉพาะที่ตัวเองส่ง (roster เต็มยังเป็น
// สิทธิ์ Owner เท่านั้นตาม FR-USR-01 เดิม)
export async function listPendingInvites() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "กรุณาล็อกอินก่อน" };
  }

  const actor = await prisma.user.findUnique({ where: { id: user.id } });
  if (!actor) {
    return { error: "ไม่พบข้อมูลผู้ใช้" };
  }

  try {
    requirePermission(actor.role, "invite", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ดูคำเชิญ" };
    throw e;
  }

  const invites = await prisma.userInvite.findMany({
    where: {
      organizationId: actor.organizationId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      ...(actor.role === "owner" ? {} : { invitedById: actor.id }),
    },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { fullName: true } } },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      invitedByName: invite.invitedBy.fullName,
      inviteLink: `${siteUrl}/invite/accept?token=${invite.token}`,
    })),
  };
}

// ยกเลิกคำเชิญที่ยังไม่หมดอายุได้เอง — เดิม createInvite() บล็อกอีเมลที่มี invite
// ค้างอยู่ไม่ให้เชิญซ้ำ ทำให้ถ้าลิงก์หายต้องรอ 7 วันให้หมดอายุก่อนถึงจะเชิญอีเมล
// เดิมใหม่ได้ ยกเลิกเองได้ตรงนี้จึงเชิญซ้ำได้ทันทีโดยไม่ต้องรอ
export async function cancelInvite(inviteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "กรุณาล็อกอินก่อน" };
  }

  const actor = await prisma.user.findUnique({ where: { id: user.id } });
  if (!actor) {
    return { error: "ไม่พบข้อมูลผู้ใช้" };
  }

  try {
    requirePermission(actor.role, "invite", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ยกเลิกคำเชิญ" };
    throw e;
  }

  const invite = await prisma.userInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.organizationId !== actor.organizationId) {
    return { error: "ไม่พบคำเชิญนี้" };
  }
  if (actor.role !== "owner" && invite.invitedById !== actor.id) {
    return { error: "คุณไม่มีสิทธิ์ยกเลิกคำเชิญนี้" };
  }

  await prisma.userInvite.delete({ where: { id: inviteId } });
  return { success: true };
}

// ยอมรับ invite และตั้งรหัสผ่าน
export async function acceptInvite(token: string, formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  // DECISIONS.md D15: ต้องยอมรับ Privacy Notice ก่อนสร้างบัญชีได้
  const acceptPdpa = formData.get("acceptPdpa") === "on" || formData.get("acceptPdpa") === "true";

  const result = acceptInviteSchema.safeParse({ token, password, confirmPassword, acceptPdpa });
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  // ตรวจสอบ invite token
  const invite = await prisma.userInvite.findFirst({
    where: {
      token,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      invitedBy: true,
    },
  });

  if (!invite) {
    return { error: "คำเชิญไม่ถูกต้องหรือหมดอายุแล้ว" };
  }

  const supabase = await createClient();

  // สร้าง user ใน Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: invite.email,
    password,
    options: {
      data: {
        full_name: invite.email.split("@")[0], // ใช้ชื่อชั่วคราวจากอีเมล
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || "การสร้างบัญชีล้มเหลว" };
  }

  // สร้าง user ใน Prisma
  try {
    await prisma.user.create({
      data: {
        id: authData.user.id,
        organizationId: invite.organizationId,
        email: invite.email,
        fullName: invite.email.split("@")[0],
        role: invite.role,
        isActive: true,
      },
    });

    // อัปเดต invite ว่าถูกยอมรับแล้ว
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    redirect("/dashboard");
  } catch {
    return { error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้ลงฐานข้อมูล" };
  }
}

// ตรวจสอบความถูกต้องของ invite token (สำหรับ UI แสดงฟอร์มตั้งรหัสผ่าน)
export async function validateInviteToken(token: string) {
  const invite = await prisma.userInvite.findFirst({
    where: {
      token,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      invitedBy: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!invite) {
    return { valid: false, error: "คำเชิญไม่ถูกต้องหรือหมดอายุแล้ว" };
  }

  return {
    valid: true,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invitedBy,
  };
}
