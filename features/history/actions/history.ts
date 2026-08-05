"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages, parsePageParam } from "@/lib/pagination";
import type { AuditChange } from "@/lib/audit-log";

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

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorName: string;
  action: "created" | "updated" | "deleted";
  entityType: string;
  entityName: string;
  changes: AuditChange[] | null;
}

export interface AuditLogFilters {
  page?: number;
  actorId?: string;
  entityType?: string;
  action?: "created" | "updated" | "deleted";
  search?: string;
  from?: Date;
  to?: Date;
}

// FR (this session's audit-log design spec): Owner-only, branch-scoped,
// server-paginated — the entity list includes POS sales in later waves, so
// this can't be a client-side-filtered full fetch like IngredientList does.
export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "audit_log");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูประวัติการใช้งาน") };
  }

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const page = parsePageParam(String(filters.page ?? 1));

  const where = {
    branchId: branch.id,
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.search
      ? { entityName: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: getSkip(page),
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  return {
    logs: logs.map((l): AuditLogRow => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      actorName: l.actorName,
      action: l.action,
      entityType: l.entityType,
      entityName: l.entityName,
      changes: (l.changes as AuditChange[] | null) ?? null,
    })),
    totalPages: getTotalPages(total),
    page,
  };
}
