import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";

export type PrismaTx = PrismaClient | Prisma.TransactionClient;

export type AuditPrimitive = string | number | boolean | null;

export interface AuditChange {
  field: string;
  oldValue: AuditPrimitive;
  newValue: AuditPrimitive;
}

interface RecordAuditLogInput {
  branchId: string;
  actorId: string;
  actorName: string;
  action: "created" | "updated" | "deleted";
  entityType: string;
  entityId: string;
  entityName: string;
  changes?: AuditChange[] | null;
}

// Called at the end of (or inside the same $transaction as) every mutating
// server action this plan touches — see the design spec at
// docs/superpowers/specs/2026-08-06-audit-log-design.md for why this is an
// explicit call at each call site rather than an automatic Prisma extension.
export async function recordAuditLog(tx: PrismaTx, input: RecordAuditLogInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      branchId: input.branchId,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      // Prisma's Json? fields reject a literal `null` (ambiguous between a
      // JSON null value and a SQL NULL) — Prisma.DbNull is the explicit "no
      // value" sentinel for "this column is SQL NULL". AuditChange[] is cast
      // to InputJsonValue because Prisma's strict Json input type doesn't
      // structurally recognize a typed interface array, even though every
      // field on AuditChange is already a plain JSON-safe primitive.
      changes: input.changes ? (input.changes as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

// Prisma Decimal and Date values are never === even when equal, and neither
// is a valid Prisma Json value on their own — normalize both to a
// JSON-safe primitive before comparing or storing.
function toAuditPrimitive(value: unknown): AuditPrimitive {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return String(value);
  return value as AuditPrimitive;
}

// For "updated" events — only the fields that actually differ, old -> new.
// before/after are intentionally independent type parameters (not both the
// same T): call sites often diff a full Prisma row (before) against a
// smaller literal of just the updated fields (after).
export function diffFields<
  TBefore extends Record<string, unknown>,
  TAfter extends Record<string, unknown>,
>(
  before: TBefore,
  after: TAfter,
  fields: (Extract<keyof TBefore, keyof TAfter> & string)[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const oldValue = toAuditPrimitive(before[field]);
    const newValue = toAuditPrimitive(after[field]);
    if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
}

// For "created" events — every relevant field, oldValue always null.
export function snapshotFields<T extends Record<string, unknown>>(
  entity: T,
  fields: (keyof T & string)[],
): AuditChange[] {
  return fields.map((field) => ({
    field,
    oldValue: null,
    newValue: toAuditPrimitive(entity[field]),
  }));
}
