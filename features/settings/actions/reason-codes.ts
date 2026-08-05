"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { STOCK_OUT_REASON_CODES } from "@/features/inventory/constants/reason-codes";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
import {
  reasonCodeSchema,
  ReasonCodeInput,
  reasonCodeUpdateSchema,
  ReasonCodeUpdateInput,
} from "../schemas/settings.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// Lazily seeds the Phase 6 hardcoded defaults on first real access so
// historical inventory_movements.reason_code values ("spoiled", "broken", ...)
// stay valid — mirrors getOrCreateCompanySettings()'s singleton pattern.
async function ensureSeeded(actorId: string, organizationId: string) {
  const count = await prisma.reasonCode.count();
  if (count > 0) return;
  await prisma.reasonCode.createMany({
    data: STOCK_OUT_REASON_CODES.map((r) => ({
      code: r.value,
      label: r.label,
      createdBy: actorId,
      organizationId,
    })),
  });
}

// FR-INV-02: any logged-in user doing a stock-out needs the active reason
// list — not gated by the "settings" permission (only managing it is).
export async function listReasonCodes() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  await ensureSeeded(actor.id, actor.organizationId);

  const codes = await prisma.reasonCode.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return { codes: codes.map((c) => ({ code: c.code, label: c.label })) };
}

// FR-SET-05: full management list (incl. inactive), Owner-only via Settings.
export async function listAllReasonCodes() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูการตั้งค่า") };
  }

  await ensureSeeded(actor.id, actor.organizationId);

  const codes = await prisma.reasonCode.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return {
    codes: codes.map((c) => ({ id: c.id, code: c.code, label: c.label, isActive: c.isActive })),
  };
}

interface ReasonCodeRowResult {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

export async function createReasonCode(
  input: ReasonCodeInput,
): Promise<{ error: string } | { success: true; code: ReasonCodeRowResult }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มเหตุผล") };
  }

  const result = reasonCodeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const existing = await prisma.reasonCode.findUnique({ where: { code: result.data.code } });
  if (existing) return { error: "มีรหัสนี้อยู่แล้ว กรุณาใช้รหัสอื่น" };

  const code = await prisma.reasonCode.create({
    data: {
      code: result.data.code,
      label: result.data.label,
      createdBy: actor.id,
      organizationId: actor.organizationId,
    },
  });

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "reason_code",
    entityId: code.id,
    entityName: `${code.code} — ${code.label}`,
    changes: snapshotFields(code, ["code", "label", "isActive"]),
  });

  return {
    success: true,
    code: { id: code.id, code: code.code, label: code.label, isActive: code.isActive },
  };
}

export async function updateReasonCode(
  id: string,
  input: ReasonCodeUpdateInput,
): Promise<{ error: string } | { success: true }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเหตุผล") };
  }

  const result = reasonCodeUpdateSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.reasonCode.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเหตุผล" };

  await prisma.reasonCode.update({
    where: { id },
    data: { label: result.data.label, isActive: result.data.isActive, updatedBy: actor.id },
  });

  const changes = diffFields(
    current,
    { label: result.data.label, isActive: result.data.isActive },
    ["label", "isActive"],
  );
  if (changes.length > 0) {
    const branch = await getOrCreateDefaultBranch(actor.organizationId);
    await recordAuditLog(prisma, {
      branchId: branch.id,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "reason_code",
      entityId: id,
      entityName: `${current.code} — ${result.data.label}`,
      changes,
    });
  }

  return { success: true };
}

// FR-EXP-03-style soft delete — reason codes may be referenced by historical
// inventory_movements rows, so never hard-delete (mirrors softDeleteIngredient).
export async function softDeleteReasonCode(
  id: string,
): Promise<{ error: string } | { success: true }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบเหตุผล") };
  }

  const current = await prisma.reasonCode.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเหตุผล" };

  await prisma.reasonCode.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "reason_code",
    entityId: id,
    entityName: `${current.code} — ${current.label}`,
  });

  return { success: true };
}
