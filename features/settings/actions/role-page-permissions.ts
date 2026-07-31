"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getSkip, getTotalPages } from "@/lib/pagination";
import {
  PAGE_KEYS,
  NON_OWNER_ROLES,
  buildDefaultPermissionChanges,
  isDefaultAllowed,
  type PageKey,
} from "@/lib/page-access";
import {
  rolePagePermissionUpdateSchema,
  RolePagePermissionUpdateInput,
} from "../schemas/settings.schema";
import type { UserRole } from "@/lib/generated/prisma/enums";

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

export interface RolePagePermissionRow {
  role: UserRole;
  pageKey: PageKey;
  allowed: boolean;
}

export async function listRolePagePermissions(): Promise<
  { error: string } | { rows: RolePagePermissionRow[] }
> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูการตั้งค่านี้") };
  }

  const existing = await prisma.rolePagePermission.findMany();
  const allowedByKey = new Map(existing.map((r) => [`${r.role}:${r.pageKey}`, r.allowed]));

  const rows: RolePagePermissionRow[] = [];
  for (const role of NON_OWNER_ROLES) {
    for (const pageKey of PAGE_KEYS) {
      rows.push({ role, pageKey, allowed: allowedByKey.get(`${role}:${pageKey}`) ?? false });
    }
  }
  return { rows };
}

export async function updateRolePagePermissions(
  input: RolePagePermissionUpdateInput,
): Promise<{ error: string } | { success: true }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "update", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสิทธิ์การใช้งาน") };
  }

  const result = rolePagePermissionUpdateSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  // Revoke-only ceiling (D19). The grid can turn a role's page access OFF, or
  // back ON if the seeded default already had it ON — never ON beyond the
  // seed. Enforced here, not just by disabling checkboxes in
  // role-permission-grid.tsx, because a Server Action is callable directly:
  // the client is never trusted. Rejecting the whole batch (rather than
  // silently dropping the offending cells) keeps the owner from believing a
  // grant landed when it did not; the real UI can never submit one.
  const beyondDefaults = result.data.changes.filter(
    (c) => c.allowed && !isDefaultAllowed(c.role, c.pageKey),
  );
  if (beyondDefaults.length > 0) {
    return {
      error:
        "ระบบนี้ปรับได้เฉพาะการ 'ปิด' การเข้าถึงหน้าเท่านั้น ให้สิทธิ์เกินค่าเริ่มต้นของระบบไม่ได้ — ต้องปรับสิทธิ์การใช้งาน (CRUD permission) ในโค้ดก่อน",
    };
  }

  const existing = await prisma.rolePagePermission.findMany();
  const allowedByKey = new Map(existing.map((r) => [`${r.role}:${r.pageKey}`, r.allowed]));

  const changed = result.data.changes.filter(
    (c) => (allowedByKey.get(`${c.role}:${c.pageKey}`) ?? false) !== c.allowed,
  );
  if (changed.length === 0) return { success: true };

  await prisma.$transaction(async (tx) => {
    for (const c of changed) {
      await tx.rolePagePermission.upsert({
        where: { role_pageKey: { role: c.role, pageKey: c.pageKey } },
        create: { role: c.role, pageKey: c.pageKey, allowed: c.allowed, updatedBy: actor.id },
        update: { allowed: c.allowed, updatedBy: actor.id },
      });
    }
    await tx.permissionChangeLog.createMany({
      data: changed.map((c) => ({
        role: c.role,
        pageKey: c.pageKey,
        allowed: c.allowed,
        changedBy: actor.id,
      })),
    });
  });

  return { success: true };
}

export async function resetRolePagePermissionsToDefault(): Promise<
  { error: string } | { success: true }
> {
  return updateRolePagePermissions({
    changes: buildDefaultPermissionChanges() as Array<{
      role: "manager" | "shift_supervisor" | "cashier" | "employee" | "accountant";
      pageKey: PageKey;
      allowed: boolean;
    }>,
  });
}

export interface PermissionChangeLogEntry {
  id: string;
  role: UserRole;
  pageKey: PageKey;
  allowed: boolean;
  changedByName: string;
  changedAt: Date;
}

const CHANGE_LOG_PAGE_SIZE = 50;

export async function listPermissionChangeLog(
  page: number,
): Promise<
  | { error: string }
  | { entries: PermissionChangeLogEntry[]; page: number; totalPages: number; total: number }
> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูประวัติการเปลี่ยนแปลง") };
  }

  const [total, rows] = await Promise.all([
    prisma.permissionChangeLog.count(),
    prisma.permissionChangeLog.findMany({
      orderBy: { changedAt: "desc" },
      skip: getSkip(page, CHANGE_LOG_PAGE_SIZE),
      take: CHANGE_LOG_PAGE_SIZE,
    }),
  ]);

  const changedByIds = [...new Set(rows.map((r) => r.changedBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: changedByIds } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  const entries: PermissionChangeLogEntry[] = rows.map((r) => ({
    id: r.id,
    role: r.role as UserRole,
    pageKey: r.pageKey as PageKey,
    allowed: r.allowed,
    changedByName: nameById.get(r.changedBy) ?? "ไม่ทราบ",
    changedAt: r.changedAt,
  }));

  return {
    entries,
    page,
    totalPages: getTotalPages(total, CHANGE_LOG_PAGE_SIZE),
    total,
  };
}
