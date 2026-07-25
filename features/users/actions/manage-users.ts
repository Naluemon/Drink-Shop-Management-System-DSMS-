"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, PermissionError } from "@/lib/permissions";
import type { UserRole } from "@/lib/generated/prisma/enums";

const VALID_ROLES: readonly UserRole[] = [
  "owner",
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
];

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

// FR-USR-01: Owner ดู List ผู้ใช้ทั้งหมดพร้อม role และสถานะ active/inactive
export async function listUsers() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ดูรายชื่อผู้ใช้" };
    throw e;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return { users };
}

// FR-USR-03: Owner ปิด/เปิดการใช้งานผู้ใช้ได้ทันที
export async function toggleUserActive(targetUserId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์แก้ไขสถานะผู้ใช้" };
    throw e;
  }

  if (targetUserId === actor.id) {
    return { error: "ไม่สามารถปิดการใช้งานบัญชีของตนเองได้" };
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "ไม่พบผู้ใช้" };

  await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive: !target.isActive },
  });

  return { success: true };
}

// เผื่อกรณี invite ผิดบทบาทตั้งแต่แรก — "update" บน user_management เป็นสิทธิ์ของ
// Owner เท่านั้น (Manager มีแค่ "invite" ใน matrix ของ lib/permissions.ts) และ
// ห้ามเปลี่ยนบทบาทของตัวเอง (กันเจ้าของร้านลดสิทธิ์ตัวเองจนล็อกตัวเองออก —
// เช่นเดียวกับ toggleUserActive ด้านบน)
export async function updateUserRole(targetUserId: string, newRole: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "user_management");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์เปลี่ยนบทบาทผู้ใช้" };
    throw e;
  }

  if (targetUserId === actor.id) {
    return { error: "ไม่สามารถเปลี่ยนบทบาทของตนเองได้" };
  }

  if (!VALID_ROLES.includes(newRole as UserRole)) {
    return { error: "บทบาทไม่ถูกต้อง" };
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "ไม่พบผู้ใช้" };

  await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole as UserRole },
  });

  return { success: true };
}
