"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateTaxSettings } from "@/lib/settings";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

// IMPLEMENTATION_PLAN Phase 2 task: refund_approval_threshold for Shift
// Supervisor (D5, D14). Full Settings (tax/receipt/business hours/...) is
// Phase 12 — this exposes only the one field Phase 2 needs.
export async function getRefundApprovalThreshold() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "settings");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้" };
    throw e;
  }

  const settings = await getOrCreateTaxSettings();
  return { threshold: settings.refundApprovalThreshold.toString() };
}

const thresholdSchema = z.object({
  threshold: z.coerce.number().positive("จำนวนเงินต้องมากกว่า 0"),
});

export async function updateRefundApprovalThreshold(formData: FormData) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "settings");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์แก้ไขการตั้งค่านี้" };
    throw e;
  }

  const result = thresholdSchema.safeParse({ threshold: formData.get("threshold") });
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const settings = await getOrCreateTaxSettings();
  await prisma.taxSettings.update({
    where: { id: settings.id },
    data: { refundApprovalThreshold: result.data.threshold },
  });

  return { success: true, message: "บันทึกสำเร็จ" };
}
