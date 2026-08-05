# Audit Log — Wave 1 (Foundation + Master Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, Owner-only `/history` page that records who created, edited, or deleted ingredients, unit conversions, menu categories, menus, menu variants, modifier-group links, modifier groups, modifiers, recipes, recipe ingredients, and suppliers — with old-value → new-value detail for edits.

**Architecture:** One new `AuditLog` table (branch-scoped, generic across entity types). A single `lib/audit-log.ts` helper (`recordAuditLog` + `diffFields`) that every mutating server action calls explicitly, inside the same `prisma.$transaction` as the mutation itself. A new `features/history` module (server action + list UI + detail dialog) renders it, gated Owner-only via the existing `lib/permissions.ts` / `lib/page-access.ts` mechanisms.

**Tech Stack:** Next.js App Router server actions, Prisma ORM, Zod (existing schemas, unchanged), Vitest + `vitest-mock-extended`'s `mockDeep<PrismaClient>()` for tests (matches every existing `*.test.ts` in this repo).

## Global Constraints

- Every mutating server action must call `requirePermission()` as its first line before touching business logic (existing repo rule, AGENTS.md §3) — unchanged by this plan, audit logging is additive.
- Soft-delete only for master data — never a hard `delete()` (existing repo rule, DATABASE.md §4) — unchanged.
- New Prisma fields/tables: snake_case columns via `@map`, camelCase Prisma fields (existing repo rule, DATABASE.md §1).
- Every new/changed server action needs a matching `*.test.ts` using `mockDeep<PrismaClient>()`, matching the existing convention in every `features/*/actions/*.test.ts` file.
- Run `npx tsc --noEmit -p tsconfig.json`, `npx eslint <changed files>`, and `npx vitest run` after every task — do not proceed to the next task on a red build.

---

### Task 1: Schema — `AuditLog` model + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Migration: generated via `npx prisma migrate dev --name add_audit_log`

**Interfaces:**

- Produces: `prisma.auditLog.create(...)` / `tx.auditLog.create(...)` — a Prisma model `AuditLog` with fields `id, branchId, actorId, actorName, action (AuditAction), entityType, entityId, entityName, changes (Json?), createdAt`. Enum `AuditAction { created, updated, deleted }`.

- [ ] **Step 1: Add the enum and model**

Add near the other enums (after `MovementType`, matches existing enum grouping) and near the other feature models (after the `Modifier` model, before the `// Purchase` section comment) in `prisma/schema.prisma`:

```prisma
/// New table (this plan) — system-wide "who changed what" trail.
enum AuditAction {
  created
  updated
  deleted

  @@map("audit_action")
}
```

```prisma
/// New table (this plan) — generic across every audited entity type. branchId/
/// actorId are plain scoped ids (no @relation), matching how every other model
/// in this schema references branch/creator — see Ingredient.branchId /
/// Ingredient.createdBy for the precedent. actorName is a denormalized
/// snapshot on purpose: survives the user later being deleted/renamed, and
/// avoids a join just to render the history list.
model AuditLog {
  id         String      @id @default(uuid())
  branchId   String      @map("branch_id")
  actorId    String      @map("actor_id")
  actorName  String      @map("actor_name")
  action     AuditAction
  entityType String      @map("entity_type")
  entityId   String      @map("entity_id")
  entityName String      @map("entity_name")
  changes    Json?
  createdAt  DateTime    @default(now()) @map("created_at")

  @@index([branchId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_audit_log`
Expected: a new folder under `prisma/migrations/` containing the `CREATE TYPE audit_action`, `CREATE TABLE audit_logs`, and the two indexes; command exits 0 and regenerates the Prisma client.

- [ ] **Step 3: Verify the client picked up the new model**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (confirms `lib/generated/prisma` now exports `AuditLog`/`AuditAction` types — nothing references them yet, so this just checks the generator ran cleanly).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add AuditLog table for system-wide change history"
```

---

### Task 2: `lib/audit-log.ts` — logging helper + diff utility

**Files:**

- Create: `lib/audit-log.ts`
- Test: `lib/audit-log.test.ts`

**Interfaces:**

- Consumes: `Prisma.TransactionClient | PrismaClient` from `@/lib/generated/prisma/client`.
- Produces:
  - `export interface AuditChange { field: string; oldValue: string | number | boolean | null; newValue: string | number | boolean | null }`
  - `export type PrismaTx = import("@/lib/generated/prisma/client").PrismaClient | import("@/lib/generated/prisma/client").Prisma.TransactionClient`
  - `export async function recordAuditLog(tx: PrismaTx, input: { branchId: string; actorId: string; actorName: string; action: "created" | "updated" | "deleted"; entityType: string; entityId: string; entityName: string; changes?: AuditChange[] | null }): Promise<void>`
  - `export function diffFields<T extends Record<string, unknown>>(before: T, after: T, fields: (keyof T & string)[]): AuditChange[]`
  - `export function snapshotFields<T extends Record<string, unknown>>(entity: T, fields: (keyof T & string)[]): AuditChange[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/audit-log.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

import { prisma } from "@/lib/prisma";
import { recordAuditLog, diffFields, snapshotFields } from "./audit-log";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("recordAuditLog", () => {
  it("inserts a row with the given fields", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await recordAuditLog(prismaMock, {
      branchId: "branch-1",
      actorId: "actor-1",
      actorName: "เจ้าของร้าน",
      action: "updated",
      entityType: "ingredient",
      entityId: "ing-1",
      entityName: "ผงชาไทย",
      changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        branchId: "branch-1",
        actorId: "actor-1",
        actorName: "เจ้าของร้าน",
        action: "updated",
        entityType: "ingredient",
        entityId: "ing-1",
        entityName: "ผงชาไทย",
        changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
      },
    });
  });

  it("stores null changes as null, not undefined, so deleted events have an explicit shape", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await recordAuditLog(prismaMock, {
      branchId: "branch-1",
      actorId: "actor-1",
      actorName: "เจ้าของร้าน",
      action: "deleted",
      entityType: "ingredient",
      entityId: "ing-1",
      entityName: "ผงชาไทย",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changes: null }) }),
    );
  });
});

describe("diffFields", () => {
  it("returns only the fields that actually changed", () => {
    const before = { name: "ผงชาไทย", costPerUnit: 20, lowStockThreshold: null };
    const after = { name: "ผงชาไทย", costPerUnit: 25, lowStockThreshold: null };

    const changes = diffFields(before, after, ["name", "costPerUnit", "lowStockThreshold"]);

    expect(changes).toEqual([{ field: "costPerUnit", oldValue: 20, newValue: 25 }]);
  });

  it("stringifies Decimal-like objects (a .toString() method) so they compare and store correctly", () => {
    const decimal = (v: string) => ({ toString: () => v });
    const before = { costPerUnit: decimal("20") };
    const after = { costPerUnit: decimal("20.00") };

    // "20" !== "20.00" as strings — this documents that diffFields does a
    // string comparison, not a numeric one, so callers should pass
    // already-normalized values if trailing zeros shouldn't count as a change.
    const changes = diffFields(before, after, ["costPerUnit"]);

    expect(changes).toEqual([{ field: "costPerUnit", oldValue: "20", newValue: "20.00" }]);
  });

  it("stringifies Date values to ISO strings", () => {
    const before = { openedAt: new Date("2026-08-01T00:00:00.000Z") };
    const after = { openedAt: new Date("2026-08-02T00:00:00.000Z") };

    const changes = diffFields(before, after, ["openedAt"]);

    expect(changes).toEqual([
      {
        field: "openedAt",
        oldValue: "2026-08-01T00:00:00.000Z",
        newValue: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });

  it("treats null and undefined as equal (both become null)", () => {
    const before: { note: string | null | undefined } = { note: null };
    const after: { note: string | null | undefined } = { note: undefined };

    expect(diffFields(before, after, ["note"])).toEqual([]);
  });
});

describe("snapshotFields", () => {
  it("returns every field with a null oldValue, for create events", () => {
    const entity = { name: "ผงชาไทย", costPerUnit: 20 };

    expect(snapshotFields(entity, ["name", "costPerUnit"])).toEqual([
      { field: "name", oldValue: null, newValue: "ผงชาไทย" },
      { field: "costPerUnit", oldValue: null, newValue: 20 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/audit-log.test.ts`
Expected: FAIL — `Cannot find module './audit-log'`.

- [ ] **Step 3: Implement `lib/audit-log.ts`**

```ts
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

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
      changes: input.changes ?? null,
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
// before/after are intentionally independent type parameters (not both `T`):
// call sites often diff a full Prisma row (before) against a smaller literal
// of just the updated fields (after), and forcing both to the same shape
// makes inference fail or silently widen to `any` at several call sites in
// this plan (e.g. updateMenu, updateSupplier).
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/audit-log.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint lib/audit-log.ts lib/audit-log.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/audit-log.ts lib/audit-log.test.ts
git commit -m "feat: add recordAuditLog/diffFields helper for change history"
```

---

### Task 3: Permissions, page access, and nav entry

**Files:**

- Modify: `lib/permissions.ts`
- Modify: `lib/page-access.ts`
- Modify: `components/nav-config.ts`
- Test: `lib/page-access.test.ts` (extend if it exists, else check `lib/permissions.test.ts` — search first with Glob for `lib/*permission*.test.ts` / `lib/*page-access*.test.ts` before writing new assertions, to append rather than duplicate a test file)

**Interfaces:**

- Consumes: nothing new.
- Produces: `Resource` union now includes `"audit_log"`; `PageKey` now includes `"history"`; `requirePermission(role, "view", "audit_log")` and `canAccessPage(role, "history", map)` both true only for `owner`.

- [ ] **Step 1: Add the `audit_log` resource**

In `lib/permissions.ts`, add `"audit_log"` to the `Resource` union (after `"settings"`):

```ts
export type Resource =
  | "ingredient"
  | "recipe"
  | "menu"
  | "stock_in"
  | "stock_out"
  | "adjustment"
  | "purchase"
  | "pos_sale"
  | "pos_void"
  | "pos_refund"
  | "expense"
  | "user_management"
  | "dashboard"
  | "reports"
  | "settings"
  | "audit_log";
```

And add a row to `MATRIX` (after `settings:`):

```ts
  settings:         { owner: CRUD },
  audit_log:        { owner: ["view"] },
```

- [ ] **Step 2: Add the `history` page key**

In `lib/page-access.ts`, add `"history"` to `PAGE_KEYS` (after `"settings"`):

```ts
export const PAGE_KEYS = [
  "pos",
  "refunds",
  "ingredients",
  "recipes",
  "menus",
  "modifier-groups",
  "inventory",
  "suppliers",
  "purchases",
  "expenses",
  "reports",
  "users",
  "settings",
  "history",
] as const;
```

And add `history: []` to `DEFAULT_ALLOWED_ROLES` (after `settings: []`) — an empty ceiling means the revoke-only permission grid can never grant this to a non-owner role, matching how `settings` already works:

```ts
  settings: [],
  history: [],
```

- [ ] **Step 3: Add the nav item**

In `components/nav-config.ts`, add to the `"ระบบ"` group, after `settings` (needs the `History` icon from `lucide-react`, add it to the import list at the top):

```ts
import {
  LayoutDashboard,
  Package,
  BookOpen,
  Coffee,
  SlidersHorizontal,
  Boxes,
  Truck,
  ClipboardList,
  Users,
  Settings,
  ShoppingCart,
  Undo2,
  Receipt,
  BarChart3,
  HelpCircle,
  History,
  type LucideIcon,
} from "lucide-react";
```

```ts
  {
    label: "ระบบ",
    items: [
      { href: "/users", label: "จัดการผู้ใช้", icon: Users, pageKey: "users" },
      { href: "/settings", label: "ตั้งค่าระบบ", icon: Settings, pageKey: "settings" },
      { href: "/history", label: "ประวัติการใช้งาน", icon: History, pageKey: "history" },
    ],
  },
```

- [ ] **Step 4: Check for and extend existing tests**

Run: `ls lib/*.test.ts` (or the project's Glob tool) to find `lib/permissions.test.ts` and/or `lib/page-access.test.ts`. If either exists, add one assertion each:

```ts
// in lib/permissions.test.ts, inside an existing describe or a new one:
it("only owner can view audit_log", () => {
  expect(hasPermission("owner", "view", "audit_log")).toBe(true);
  expect(hasPermission("manager", "view", "audit_log")).toBe(false);
});
```

```ts
// in lib/page-access.test.ts:
it("history is never in DEFAULT_ALLOWED_ROLES for any non-owner role", () => {
  expect(DEFAULT_ALLOWED_ROLES.history).toEqual([]);
});
```

If neither test file exists, skip this step (nothing else in `lib/` currently has one — don't introduce a new test file convention mid-plan; `features/history/actions/history.test.ts` in Task 4 covers the same guarantee end-to-end via `requirePermission`).

- [ ] **Step 5: Typecheck, lint, run tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint lib/permissions.ts lib/page-access.ts components/nav-config.ts && npx vitest run`
Expected: no type errors, no lint errors, all existing tests still pass (this also exercises `components/nav-config.test.ts`, which snapshots/asserts on `NAV_GROUPS` shape — check its output for a snapshot that needs updating).

- [ ] **Step 6: Commit**

```bash
git add lib/permissions.ts lib/page-access.ts components/nav-config.ts
git commit -m "feat: gate a new Owner-only history page behind permissions/nav"
```

---

### Task 4: `features/history` — server action

**Files:**

- Create: `features/history/actions/history.ts`
- Test: `features/history/actions/history.test.ts`

**Interfaces:**

- Consumes: `recordAuditLog`'s stored shape (reads `prisma.auditLog`, not this plan's own output).
- Produces: `export async function listAuditLogs(filters?: { page?: number; actorId?: string; entityType?: string; action?: "created" | "updated" | "deleted"; search?: string; from?: Date; to?: Date }): Promise<{ error: string } | { logs: AuditLogRow[]; totalPages: number; page: number }>` where `AuditLogRow = { id: string; createdAt: string; actorName: string; action: "created"|"updated"|"deleted"; entityType: string; entityName: string; changes: { field: string; oldValue: string|number|boolean|null; newValue: string|number|boolean|null }[] | null }`.

- [ ] **Step 1: Write the failing tests**

Create `features/history/actions/history.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import { listAuditLogs } from "./history";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

describe("listAuditLogs", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await listAuditLogs();

    expect("error" in result).toBe(true);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("rejects a non-owner role", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await listAuditLogs();

    expect("error" in result).toBe(true);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the actor's branch and paginates", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.auditLog.count.mockResolvedValue(1 as never);
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        branchId: "branch-1",
        actorId: "actor-1",
        actorName: "เจ้าของร้าน",
        action: "updated",
        entityType: "ingredient",
        entityId: "ing-1",
        entityName: "ผงชาไทย",
        changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
        createdAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    ] as never);

    const result = await listAuditLogs();

    expect("logs" in result && result.logs).toHaveLength(1);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "branch-1" }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("applies actor/entityType/action/search filters", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.auditLog.count.mockResolvedValue(0 as never);
    prismaMock.auditLog.findMany.mockResolvedValue([] as never);

    await listAuditLogs({
      actorId: "actor-2",
      entityType: "ingredient",
      action: "deleted",
      search: "ชา",
    });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: "branch-1",
          actorId: "actor-2",
          entityType: "ingredient",
          action: "deleted",
          entityName: { contains: "ชา", mode: "insensitive" },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run features/history/actions/history.test.ts`
Expected: FAIL — `Cannot find module './history'`.

- [ ] **Step 3: Implement `features/history/actions/history.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run features/history/actions/history.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint features/history/actions/history.ts features/history/actions/history.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add features/history/actions/history.ts features/history/actions/history.test.ts
git commit -m "feat: add listAuditLogs server action"
```

---

### Task 5: `features/history` — page and UI

**Files:**

- Create: `features/history/components/history-list.tsx`
- Create: `features/history/components/history-detail-dialog.tsx`
- Create: `app/history/page.tsx`

**Interfaces:**

- Consumes: `listAuditLogs`, `AuditLogRow`, `AuditLogFilters` from Task 4; `getProfile`, `logout`, `canAccessPage`, `getRolePagePermissionMap`, `AppShell` (existing, same imports as `app/ingredients/page.tsx`).
- Produces: the `/history` route; no other task depends on this one.

- [ ] **Step 1: Build the detail dialog**

Create `features/history/components/history-detail-dialog.tsx`:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AuditLogRow } from "../actions/history";

const ACTION_LABELS: Record<AuditLogRow["action"], string> = {
  created: "เพิ่ม",
  updated: "แก้ไข",
  deleted: "ลบ",
};

function formatValue(v: string | number | boolean | null): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  return String(v);
}

// Field names are stored as raw object keys (e.g. "costPerUnit") — no
// translation table exists per-entity yet, so this renders the raw key.
// Good enough for an Owner-only technical audit trail; revisit if that reads
// as too raw in practice.
export function HistoryDetailDialog({ log }: { log: AuditLogRow }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>ดูรายละเอียด</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABELS[log.action]} — {log.entityName}
          </DialogTitle>
        </DialogHeader>
        {log.changes && log.changes.length > 0 ? (
          <ul className="space-y-2">
            {log.changes.map((c) => (
              <li key={c.field} className="bg-muted/30 rounded-md px-3 py-2 text-sm">
                <div className="text-muted-foreground text-xs">{c.field}</div>
                {log.action === "created" ? (
                  <div>{formatValue(c.newValue)}</div>
                ) : (
                  <div>
                    {formatValue(c.oldValue)} <span className="text-muted-foreground">→</span>{" "}
                    {formatValue(c.newValue)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">ไม่มีรายละเอียดเพิ่มเติม</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build the list**

Create `features/history/components/history-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { listAuditLogs, type AuditLogRow } from "../actions/history";
import { HistoryDetailDialog } from "./history-detail-dialog";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ACTION_LABELS: Record<AuditLogRow["action"], string> = {
  created: "เพิ่ม",
  updated: "แก้ไข",
  deleted: "ลบ",
};

const ALL_ACTIONS = "__all__";
const ALL_ENTITY_TYPES = "__all__";

interface HistoryListProps {
  initialLogs: AuditLogRow[];
  initialTotalPages: number;
  entityTypeOptions: { value: string; label: string }[];
}

// Server-side filtered/paginated (unlike IngredientList's client-side
// filtering) — audit logs (POS sales included, per the design spec) can grow
// far larger than a client-side full-table fetch should handle.
export function HistoryList({
  initialLogs,
  initialTotalPages,
  entityTypeOptions,
}: HistoryListProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(ALL_ACTIONS);
  const [entityType, setEntityType] = useState(ALL_ENTITY_TYPES);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextPage: number) {
    setError(null);
    startTransition(async () => {
      const result = await listAuditLogs({
        page: nextPage,
        search: search || undefined,
        action: action === ALL_ACTIONS ? undefined : (action as AuditLogRow["action"]),
        entityType: entityType === ALL_ENTITY_TYPES ? undefined : entityType,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLogs(result.logs);
      setTotalPages(result.totalPages);
      setPage(nextPage);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อรายการ..."
        />
        <Select value={action} onValueChange={(v) => setAction(v ?? ALL_ACTIONS)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="ทุกการกระทำ">
              {(v: string) =>
                v === ALL_ACTIONS ? "ทุกการกระทำ" : ACTION_LABELS[v as AuditLogRow["action"]]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>ทุกการกระทำ</SelectItem>
            <SelectItem value="created">เพิ่ม</SelectItem>
            <SelectItem value="updated">แก้ไข</SelectItem>
            <SelectItem value="deleted">ลบ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={(v) => setEntityType(v ?? ALL_ENTITY_TYPES)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="ทุกประเภทข้อมูล">
              {(v: string) =>
                v === ALL_ENTITY_TYPES
                  ? "ทุกประเภทข้อมูล"
                  : (entityTypeOptions.find((o) => o.value === v)?.label ?? "ทุกประเภทข้อมูล")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ENTITY_TYPES}>ทุกประเภทข้อมูล</SelectItem>
            {entityTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => refetch(1)}>
          ค้นหา
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่/เวลา</TableHead>
            <TableHead>ผู้ทำรายการ</TableHead>
            <TableHead>การกระทำ</TableHead>
            <TableHead>ประเภทข้อมูล</TableHead>
            <TableHead>ชื่อรายการ</TableHead>
            <TableHead className="text-right">รายละเอียด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                ไม่พบประวัติ
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("th-TH")}
                </TableCell>
                <TableCell>{log.actorName}</TableCell>
                <TableCell>{ACTION_LABELS[log.action]}</TableCell>
                <TableCell>
                  {entityTypeOptions.find((o) => o.value === log.entityType)?.label ??
                    log.entityType}
                </TableCell>
                <TableCell className="font-medium">{log.entityName}</TableCell>
                <TableCell className="text-right">
                  <HistoryDetailDialog log={log} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          หน้า {page} จาก {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || page <= 1}
            onClick={() => refetch(page - 1)}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || page >= totalPages}
            onClick={() => refetch(page + 1)}
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build the page**

Create `app/history/page.tsx` (mirrors `app/ingredients/page.tsx`'s shape):

```tsx
import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { listAuditLogs } from "@/features/history/actions/history";
import { AppShell } from "@/components/app-shell";
import { HistoryList } from "@/features/history/components/history-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  ingredient: "วัตถุดิบ",
  unit_conversion: "หน่วยซื้อ",
  menu_category: "หมวดหมู่เมนู",
  menu: "เมนู",
  menu_variant: "ตัวเลือกขนาด",
  modifier_group: "กลุ่มตัวเลือก",
  modifier: "ตัวเลือก",
  recipe: "สูตร",
  recipe_ingredient: "วัตถุดิบในสูตร",
  supplier: "ผู้จำหน่าย",
};

export default async function HistoryPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "history", permMap)) {
    redirect("/dashboard");
  }

  const result = await listAuditLogs();
  if ("error" in result) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ประวัติการใช้งาน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ใครเพิ่ม แก้ไข หรือลบข้อมูลอะไรไปบ้าง วันเวลาไหน
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ประวัติล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              initialLogs={result.logs}
              initialTotalPages={result.totalPages}
              entityTypeOptions={Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint features/history app/history/page.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, log in as an owner-role account, navigate to `/history`. Expected: page loads, shows "ไม่พบประวัติ" (empty — nothing logs to `AuditLog` yet until Task 6+), filters/pagination controls render without errors. Log in as (or switch role to) a non-owner and confirm `/history` redirects to `/dashboard`, and the "ประวัติการใช้งาน" nav item doesn't appear for them.

- [ ] **Step 6: Commit**

```bash
git add features/history/components app/history
git commit -m "feat: add /history page UI"
```

---

### Task 6: Instrument `features/ingredients/actions/ingredients.ts`

**Files:**

- Modify: `features/ingredients/actions/ingredients.ts`
- Modify: `features/ingredients/actions/ingredients.test.ts`

**Interfaces:**

- Consumes: `recordAuditLog`, `diffFields`, `snapshotFields` from `@/lib/audit-log` (Task 2).
- Produces: nothing new for other tasks — this is a producer, not a dependency.

- [ ] **Step 1: `createIngredient` — log the create, and its starting-stock/unit-conversion side effects**

In `features/ingredients/actions/ingredients.ts`, add the import at the top:

```ts
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
```

Change the end of `createIngredient` (after the `finalIngredient` re-fetch this session already added) to log it:

```ts
  const finalIngredient = await prisma.ingredient.findUniqueOrThrow({
    where: { id: ingredient.id },
    include: { unitConversions: true },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "ingredient",
    entityId: ingredient.id,
    entityName: finalIngredient.name,
    changes: snapshotFields(
      { ...finalIngredient, costPerUnit: finalIngredient.costPerUnit.toString() },
      ["name", "baseUnit", "costPerUnit", "lowStockThreshold", "shelfLifeDaysAfterOpening", "supplierId"],
    ),
  });

  return {
    success: true,
    ingredient: finalIngredient,
    stockInError,
    unitConversionErrors: unitConversionErrors.length > 0 ? unitConversionErrors : undefined,
  };
}
```

- [ ] **Step 2: `updateIngredient` — diff old vs new**

Change `updateIngredient` to capture `current` (already fetched) before the update, and log after:

```ts
export async function updateIngredient(id: string, input: IngredientInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = ingredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  const existing = await prisma.ingredient.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" };

  const updated = await prisma.ingredient.update({
    where: { id },
    data: {
      name: result.data.name,
      baseUnit: result.data.baseUnit,
      costPerUnit: result.data.costPerUnit,
      lowStockThreshold:
        result.data.lowStockThreshold === "" || result.data.lowStockThreshold === undefined
          ? null
          : result.data.lowStockThreshold,
      shelfLifeDaysAfterOpening:
        result.data.shelfLifeDaysAfterOpening === "" ||
        result.data.shelfLifeDaysAfterOpening === undefined
          ? null
          : result.data.shelfLifeDaysAfterOpening,
      supplierId: result.data.supplierId || null,
      updatedBy: actor.id,
    },
  });

  const changes = diffFields(
    { ...current, costPerUnit: current.costPerUnit.toString() },
    { ...updated, costPerUnit: updated.costPerUnit.toString() },
    [
      "name",
      "baseUnit",
      "costPerUnit",
      "lowStockThreshold",
      "shelfLifeDaysAfterOpening",
      "supplierId",
    ],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "ingredient",
      entityId: id,
      entityName: updated.name,
      changes,
    });
  }

  return { success: true };
}
```

- [ ] **Step 3: `softDeleteIngredient` — log the delete**

```ts
export async function softDeleteIngredient(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  await prisma.ingredient.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 4: `addUnitConversion` / `deleteUnitConversion` — log against the parent ingredient**

```ts
export async function addUnitConversion(ingredientId: string, input: UnitConversionInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = unitConversionSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

  const conversion = await prisma.unitConversion.create({
    data: {
      ingredientId,
      purchaseUnitName: result.data.purchaseUnitName,
      conversionFactor: result.data.conversionFactor,
    },
  });

  await recordAuditLog(prisma, {
    branchId: ingredient.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "unit_conversion",
    entityId: conversion.id,
    entityName: `${ingredient.name} — ${conversion.purchaseUnitName}`,
    changes: snapshotFields(
      {
        purchaseUnitName: conversion.purchaseUnitName,
        conversionFactor: conversion.conversionFactor.toString(),
      },
      ["purchaseUnitName", "conversionFactor"],
    ),
  });

  return { success: true, conversion };
}

export async function deleteUnitConversion(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.unitConversion.findUnique({
    where: { id },
    include: { ingredient: true },
  });
  if (!current) return { error: "ไม่พบหน่วยซื้อ" };

  await prisma.unitConversion.delete({ where: { id } });

  await recordAuditLog(prisma, {
    branchId: current.ingredient.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "unit_conversion",
    entityId: id,
    entityName: `${current.ingredient.name} — ${current.purchaseUnitName}`,
  });

  return { success: true };
}
```

- [ ] **Step 5: `markIngredientOpened` / `clearIngredientOpened` — log as an update to `openedAt`**

```ts
export async function markIngredientOpened(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };
  if (!current.shelfLifeDaysAfterOpening) {
    return { error: "วัตถุดิบนี้ยังไม่ได้ตั้งค่าอายุการใช้งานหลังเปิด" };
  }

  const openedAt = new Date();
  await prisma.ingredient.update({
    where: { id },
    data: { openedAt, updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
    changes: diffFields({ openedAt: current.openedAt }, { openedAt }, ["openedAt"]),
  });

  return { success: true };
}

export async function clearIngredientOpened(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  await prisma.ingredient.update({
    where: { id },
    data: { openedAt: null, updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
    changes: diffFields({ openedAt: current.openedAt }, { openedAt: null }, ["openedAt"]),
  });

  return { success: true };
}
```

- [ ] **Step 6: Extend the test file**

Add to `features/ingredients/actions/ingredients.test.ts` (uses the same `prismaMock`/`actorRow` helpers already in that file — add these `it` blocks inside the existing `describe("createIngredient", ...)` block, and new `describe` blocks for the others; also add `prismaMock.auditLog.create.mockResolvedValue({} as never);` to that describe's `beforeEach`):

```ts
it("records a created audit log entry", async () => {
  prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(
    ingredientRow({ currentStockQty: 0, unitConversions: [], costPerUnit: 1 }) as never,
  );

  await createIngredient({ ...baseInput, startingStock: "" });

  expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "created",
        entityType: "ingredient",
        entityId: "ing-1",
      }),
    }),
  );
});
```

```ts
describe("updateIngredient", () => {
  const baseInput = {
    name: "ผงชาไทย",
    baseUnit: "gram" as const,
    costPerUnit: 25,
    lowStockThreshold: "" as const,
    shelfLifeDaysAfterOpening: "" as const,
    supplierId: "",
  };

  it("records an updated audit log entry with the old->new diff", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(
      ingredientRow({ costPerUnit: { toString: () => "20" } }) as never,
    );
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.ingredient.update.mockResolvedValue(
      ingredientRow({ costPerUnit: { toString: () => "25" } }) as never,
    );
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await updateIngredient("ing-1", baseInput);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([
            { field: "costPerUnit", oldValue: "20", newValue: "25" },
          ]),
        }),
      }),
    );
  });

  it("does not write a log entry when nothing actually changed", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    const same = ingredientRow({ costPerUnit: { toString: () => "25" } });
    prismaMock.ingredient.findUnique.mockResolvedValue(same as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.ingredient.update.mockResolvedValue(same as never);

    await updateIngredient("ing-1", baseInput);

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("softDeleteIngredient", () => {
  it("records a deleted audit log entry", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(ingredientRow() as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await softDeleteIngredient("ing-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "ingredient" }),
      }),
    );
  });
});
```

Add the matching imports at the top of the test file:

```ts
import {
  markIngredientOpened,
  clearIngredientOpened,
  createIngredient,
  updateIngredient,
  softDeleteIngredient,
  listIngredients,
  listSuppliers,
} from "./ingredients";
```

- [ ] **Step 7: Run tests, fix any that fail on the mock shape**

Run: `npx vitest run features/ingredients/actions/ingredients.test.ts`
Expected: PASS. If `ingredientRow()`'s default fixture doesn't include a `costPerUnit`/`baseUnit`/etc. field a new test reads, extend the fixture's default object (in the existing `function ingredientRow(overrides = {})` at the top of the file) rather than repeating full objects in every test.

- [ ] **Step 8: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint features/ingredients && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add features/ingredients/actions/ingredients.ts features/ingredients/actions/ingredients.test.ts
git commit -m "feat: record audit log entries for ingredient/unit-conversion changes"
```

---

### Task 7: Instrument `features/menus/actions/menus.ts`

**Files:**

- Modify: `features/menus/actions/menus.ts`
- Modify: `features/menus/actions/menus.test.ts`

- [ ] **Step 1: Add the import**

```ts
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
```

- [ ] **Step 2: `createMenuCategory` / `updateMenuCategory` / `softDeleteMenuCategory`**

```ts
export async function createMenuCategory(input: MenuCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างหมวดหมู่") };
  }

  const result = menuCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingCategory = await prisma.menuCategory.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  const category = await prisma.menuCategory.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      type: result.data.type,
      createdBy: actor.id,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "menu_category",
    entityId: category.id,
    entityName: category.name,
    changes: snapshotFields(category, ["name", "type"]),
  });

  return { success: true, category };
}

export async function updateMenuCategory(id: string, input: MenuCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขหมวดหมู่") };
  }

  const result = menuCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.menuCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่" };

  const existingCategory = await prisma.menuCategory.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  await prisma.menuCategory.update({
    where: { id },
    data: { name: result.data.name, type: result.data.type, updatedBy: actor.id },
  });

  const changes = diffFields(current, { name: result.data.name, type: result.data.type }, [
    "name",
    "type",
  ]);
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu_category",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteMenuCategory(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบหมวดหมู่") };
  }

  const current = await prisma.menuCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่" };

  await prisma.menuCategory.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu_category",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 3: `createMenu` / `updateMenu` / `softDeleteMenu`**

```ts
export async function createMenu(input: MenuInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingMenu = await prisma.menu.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

  const menu = await prisma.menu.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice,
      imageUrl: result.data.imageUrl || null,
      isAvailable: result.data.isAvailable,
      createdBy: actor.id,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "menu",
    entityId: menu.id,
    entityName: menu.name,
    changes: snapshotFields({ ...menu, basePrice: menu.basePrice.toString() }, [
      "name",
      "recipeId",
      "categoryId",
      "basePrice",
      "isAvailable",
    ]),
  });

  return { success: true, menu };
}

export async function updateMenu(id: string, input: MenuInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.menu.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเมนู" };

  const existingMenu = await prisma.menu.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

  await prisma.menu.update({
    where: { id },
    data: {
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice,
      imageUrl: result.data.imageUrl || null,
      isAvailable: result.data.isAvailable,
      updatedBy: actor.id,
    },
  });

  const changes = diffFields(
    { ...current, basePrice: current.basePrice.toString() },
    {
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice.toString(),
      isAvailable: result.data.isAvailable,
    },
    ["name", "recipeId", "categoryId", "basePrice", "isAvailable"],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteMenu(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบเมนู") };
  }

  const current = await prisma.menu.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเมนู" };

  await prisma.menu.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 4: `addMenuVariant` / `removeMenuVariant` / `setMenuModifierGroups`**

```ts
export async function addMenuVariant(menuId: string, input: MenuVariantInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuVariantSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) return { error: "ไม่พบเมนู" };

  const variant = await prisma.$transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx.menuVariant.updateMany({ where: { menuId }, data: { isDefault: false } });
    }
    const created = await tx.menuVariant.create({
      data: {
        menuId,
        name: result.data.name,
        recipeMultiplier: result.data.mode === "multiplier" ? result.data.recipeMultiplier : null,
        overrideRecipeId: result.data.mode === "override" ? result.data.overrideRecipeId : null,
        priceDelta: result.data.priceDelta,
        isDefault: result.data.isDefault,
      },
    });
    await recordAuditLog(tx, {
      branchId: menu.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "created",
      entityType: "menu_variant",
      entityId: created.id,
      entityName: `${menu.name} — ${created.name}`,
      changes: snapshotFields({ ...created, priceDelta: created.priceDelta.toString() }, [
        "name",
        "priceDelta",
        "isDefault",
      ]),
    });
    return created;
  });

  return {
    success: true,
    variant: {
      id: variant.id,
      name: variant.name,
      recipeMultiplier: variant.recipeMultiplier?.toString() ?? null,
      overrideRecipeId: variant.overrideRecipeId,
      priceDelta: variant.priceDelta.toString(),
      isDefault: variant.isDefault,
    },
  };
}

export async function removeMenuVariant(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const current = await prisma.menuVariant.findUnique({ where: { id }, include: { menu: true } });
  if (!current) return { error: "ไม่พบตัวเลือกขนาด" };

  await prisma.menuVariant.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAuditLog(prisma, {
    branchId: current.menu.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu_variant",
    entityId: id,
    entityName: `${current.menu.name} — ${current.name}`,
  });

  return { success: true };
}

export async function setMenuModifierGroups(menuId: string, modifierGroupIds: string[]) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) return { error: "ไม่พบเมนู" };

  await prisma.$transaction(async (tx) => {
    await tx.menuModifierGroup.deleteMany({ where: { menuId } });
    await tx.menuModifierGroup.createMany({
      data: modifierGroupIds.map((modifierGroupId) => ({ menuId, modifierGroupId })),
    });
    await recordAuditLog(tx, {
      branchId: menu.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu",
      entityId: menuId,
      entityName: menu.name,
      changes: [
        {
          field: "modifierGroupIds",
          oldValue: null,
          newValue: modifierGroupIds.join(", ") || null,
        },
      ],
    });
  });

  return { success: true };
}
```

- [ ] **Step 5: Extend `features/menus/actions/menus.test.ts`**

This file already has `describe("createIngredient", ...)`-style patterns from `updateMenuCategory`/`softDeleteMenuCategory` (added earlier this session) — follow the same `beforeEach` shape (`prismaMock.user.findUnique`, `prismaMock.menuCategory.findFirst`/`findUnique`, etc.) and add:

```ts
describe("createMenuCategory", () => {
  it("records a created audit log entry", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menuCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.create.mockResolvedValue(
      categoryRow({ name: "เครื่องดื่มเย็น", type: "drink" }) as never,
    );
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await createMenuCategory({ name: "เครื่องดื่มเย็น", type: "drink" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "menu_category" }),
      }),
    );
  });
});
```

```ts
describe("createMenu / updateMenu / softDeleteMenu audit logging", () => {
  const menuInput = {
    name: "ชาไทยเย็น",
    recipeId: "recipe-1",
    categoryId: "",
    basePrice: 45,
    imageUrl: "",
    isAvailable: true,
  };

  function menuRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "menu-1",
      branchId: "branch-1",
      name: "ชาไทยเย็น",
      recipeId: "recipe-1",
      categoryId: null,
      basePrice: { toString: () => "45" },
      imageUrl: null,
      isAvailable: true,
      ...overrides,
    };
  }

  it("createMenu records a created entry", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menu.create.mockResolvedValue(menuRow() as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await createMenu(menuInput);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "menu" }),
      }),
    );
  });

  it("updateMenu records an updated entry with a diff when the price changes", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menu.findUnique.mockResolvedValue(
      menuRow({ basePrice: { toString: () => "45" } }) as never,
    );
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menu.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await updateMenu("menu-1", { ...menuInput, basePrice: 50 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([{ field: "basePrice", oldValue: "45", newValue: "50" }]),
        }),
      }),
    );
  });

  it("softDeleteMenu records a deleted entry", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menu.findUnique.mockResolvedValue(menuRow() as never);
    prismaMock.menu.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await softDeleteMenu("menu-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "menu" }),
      }),
    );
  });
});
```

Add `createMenu, updateMenu, softDeleteMenu,` to the existing import line from `./menus` at the top of the test file, and add a `categoryRow()` fixture helper next to the existing `actorRow()` if one doesn't already exist:

```ts
function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat-1",
    branchId: "branch-1",
    name: "เครื่องดื่มเย็น",
    type: "drink",
    ...overrides,
  };
}
```

Also add `prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));` to the top-level `beforeEach` (needed for `addMenuVariant`/`setMenuModifierGroups`, which run inside `$transaction` — matches the pattern in `features/inventory/actions/inventory.test.ts`).

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run features/menus/actions/menus.test.ts && npx tsc --noEmit -p tsconfig.json && npx eslint features/menus`
Expected: all pass, no errors.

- [ ] **Step 7: Commit**

```bash
git add features/menus/actions/menus.ts features/menus/actions/menus.test.ts
git commit -m "feat: record audit log entries for menu/menu-category changes"
```

---

### Task 8: Instrument `features/menus/actions/modifier-groups.ts`

**Files:**

- Modify: `features/menus/actions/modifier-groups.ts`
- Modify/Create: `features/menus/actions/modifier-groups.test.ts` (check with Glob first — none was found in this session's earlier reads, so this is likely a new file; follow the exact mock setup from `features/menus/actions/menus.test.ts`)

- [ ] **Step 1: Add the import**

```ts
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
```

- [ ] **Step 2: `createModifierGroup` / `updateModifierGroup` / `softDeleteModifierGroup`**

```ts
export async function createModifierGroup(input: ModifierGroupInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingGroup = await prisma.modifierGroup.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

  const group = await prisma.modifierGroup.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      selectionType: result.data.selectionType,
      isRequired: result.data.isRequired,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "modifier_group",
    entityId: group.id,
    entityName: group.name,
    changes: snapshotFields(group, ["name", "selectionType", "isRequired"]),
  });

  return { success: true, group };
}

export async function updateModifierGroup(id: string, input: ModifierGroupInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบกลุ่มตัวเลือก" };

  const existingGroup = await prisma.modifierGroup.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

  await prisma.modifierGroup.update({
    where: { id },
    data: {
      name: result.data.name,
      selectionType: result.data.selectionType,
      isRequired: result.data.isRequired,
    },
  });

  const changes = diffFields(current, result.data, ["name", "selectionType", "isRequired"]);
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "modifier_group",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteModifierGroup(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบกลุ่มตัวเลือก") };
  }

  const current = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบกลุ่มตัวเลือก" };

  await prisma.modifierGroup.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "modifier_group",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 3: `addModifier` / `removeModifier`**

```ts
export async function addModifier(modifierGroupId: string, input: ModifierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const group = await prisma.modifierGroup.findUnique({ where: { id: modifierGroupId } });
  if (!group) return { error: "ไม่พบกลุ่มตัวเลือก" };

  const existingModifier = await prisma.modifier.findFirst({
    where: {
      modifierGroupId,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingModifier) return { error: "มีตัวเลือกชื่อนี้อยู่ในกลุ่มนี้แล้ว" };

  const modifier = await prisma.modifier.create({
    data: {
      modifierGroupId,
      name: result.data.name,
      ingredientId: result.data.ingredientId || null,
      ingredientQuantity: result.data.ingredientQuantity ?? null,
      priceDelta: result.data.priceDelta,
    },
    include: { ingredient: true },
  });

  await recordAuditLog(prisma, {
    branchId: group.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "modifier",
    entityId: modifier.id,
    entityName: `${group.name} — ${modifier.name}`,
    changes: snapshotFields(
      {
        name: modifier.name,
        ingredientName: modifier.ingredient?.name ?? null,
        ingredientQuantity: modifier.ingredientQuantity?.toString() ?? null,
        priceDelta: modifier.priceDelta.toString(),
      },
      ["name", "ingredientName", "ingredientQuantity", "priceDelta"],
    ),
  });

  return {
    success: true,
    modifier: {
      id: modifier.id,
      name: modifier.name,
      ingredientId: modifier.ingredientId,
      ingredientName: modifier.ingredient?.name ?? null,
      ingredientQuantity: modifier.ingredientQuantity?.toString() ?? null,
      ingredientCostPerUnit: modifier.ingredient?.costPerUnit.toString() ?? null,
      priceDelta: modifier.priceDelta.toString(),
    },
  };
}

export async function removeModifier(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const current = await prisma.modifier.findUnique({
    where: { id },
    include: { modifierGroup: true },
  });
  if (!current) return { error: "ไม่พบตัวเลือก" };

  await prisma.modifier.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAuditLog(prisma, {
    branchId: current.modifierGroup.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "modifier",
    entityId: id,
    entityName: `${current.modifierGroup.name} — ${current.name}`,
  });

  return { success: true };
}
```

- [ ] **Step 4: Create `features/menus/actions/modifier-groups.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import {
  createModifierGroup,
  updateModifierGroup,
  softDeleteModifierGroup,
  addModifier,
  removeModifier,
} from "./modifier-groups";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    branchId: "branch-1",
    name: "Topping",
    selectionType: "single",
    isRequired: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createModifierGroup", () => {
  it("records a created audit log entry", async () => {
    prismaMock.modifierGroup.findFirst.mockResolvedValue(null as never);
    prismaMock.modifierGroup.create.mockResolvedValue(groupRow() as never);

    await createModifierGroup({ name: "Topping", selectionType: "single", isRequired: false });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "modifier_group" }),
      }),
    );
  });
});

describe("updateModifierGroup", () => {
  it("records an updated entry when isRequired changes", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow({ isRequired: false }) as never);
    prismaMock.modifierGroup.findFirst.mockResolvedValue(null as never);
    prismaMock.modifierGroup.update.mockResolvedValue({} as never);

    await updateModifierGroup("group-1", {
      name: "Topping",
      selectionType: "single",
      isRequired: true,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([
            { field: "isRequired", oldValue: false, newValue: true },
          ]),
        }),
      }),
    );
  });
});

describe("softDeleteModifierGroup", () => {
  it("records a deleted entry", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow() as never);
    prismaMock.modifierGroup.update.mockResolvedValue({} as never);

    await softDeleteModifierGroup("group-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "modifier_group" }),
      }),
    );
  });
});

describe("addModifier / removeModifier", () => {
  it("addModifier records a created entry", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow() as never);
    prismaMock.modifier.findFirst.mockResolvedValue(null as never);
    prismaMock.modifier.create.mockResolvedValue({
      id: "mod-1",
      name: "ไข่มุก",
      ingredientId: null,
      ingredientQuantity: null,
      priceDelta: { toString: () => "5" },
      ingredient: null,
    } as never);

    await addModifier("group-1", { name: "ไข่มุก", ingredientId: "", priceDelta: 5 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "modifier" }),
      }),
    );
  });

  it("removeModifier records a deleted entry", async () => {
    prismaMock.modifier.findUnique.mockResolvedValue({
      id: "mod-1",
      name: "ไข่มุก",
      modifierGroup: groupRow(),
    } as never);
    prismaMock.modifier.update.mockResolvedValue({} as never);

    await removeModifier("mod-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "modifier" }),
      }),
    );
  });
});
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run features/menus/actions/modifier-groups.test.ts && npx tsc --noEmit -p tsconfig.json && npx eslint features/menus`
Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add features/menus/actions/modifier-groups.ts features/menus/actions/modifier-groups.test.ts
git commit -m "feat: record audit log entries for modifier-group/modifier changes"
```

---

### Task 9: Instrument `features/recipes/actions/recipes.ts`

**Files:**

- Modify: `features/recipes/actions/recipes.ts`
- Modify/Create: `features/recipes/actions/recipes.test.ts` (check with Glob first)

- [ ] **Step 1: Add the import**

```ts
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
```

- [ ] **Step 2: `createRecipe` / `updateRecipe` / `softDeleteRecipe`**

```ts
export async function createRecipe(input: RecipeInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างสูตร") };
  }

  const result = recipeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existing = await prisma.recipe.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีสูตรชื่อนี้อยู่แล้ว" };

  const recipe = await prisma.recipe.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      yield: result.data.yield,
      createdBy: actor.id,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "recipe",
    entityId: recipe.id,
    entityName: recipe.name,
    changes: snapshotFields({ ...recipe, yield: recipe.yield.toString() }, ["name", "yield"]),
  });

  return { success: true, recipe };
}

export async function updateRecipe(id: string, input: RecipeInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  const result = recipeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.recipe.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบสูตร" };

  const existing = await prisma.recipe.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีสูตรชื่อนี้อยู่แล้ว" };

  await prisma.recipe.update({
    where: { id },
    data: { name: result.data.name, yield: result.data.yield, updatedBy: actor.id },
  });

  const changes = diffFields(
    { ...current, yield: current.yield.toString() },
    { name: result.data.name, yield: result.data.yield.toString() },
    ["name", "yield"],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "recipe",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteRecipe(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบสูตร") };
  }

  const current = await prisma.recipe.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบสูตร" };

  await prisma.recipe.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "recipe",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 3: `addRecipeIngredient` / `removeRecipeIngredient`**

```ts
export async function addRecipeIngredient(recipeId: string, input: RecipeIngredientInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  const result = recipeIngredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) return { error: "ไม่พบสูตร" };

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: result.data.ingredientId },
  });
  if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

  const recipeIngredient = await prisma.recipeIngredient.create({
    data: {
      recipeId,
      ingredientId: result.data.ingredientId,
      quantity: result.data.quantity,
    },
  });

  await recordAuditLog(prisma, {
    branchId: recipe.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "recipe_ingredient",
    entityId: recipeIngredient.id,
    entityName: `${recipe.name} — ${ingredient.name}`,
    changes: snapshotFields(
      { ingredientName: ingredient.name, quantity: recipeIngredient.quantity.toString() },
      ["ingredientName", "quantity"],
    ),
  });

  return {
    success: true,
    recipeIngredient: {
      id: recipeIngredient.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      baseUnit: ingredient.baseUnit,
      quantity: recipeIngredient.quantity.toString(),
    },
  };
}

export async function removeRecipeIngredient(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  const current = await prisma.recipeIngredient.findUnique({
    where: { id },
    include: { recipe: true, ingredient: true },
  });
  if (!current) return { error: "ไม่พบรายการวัตถุดิบในสูตร" };

  await prisma.recipeIngredient.delete({ where: { id } });

  await recordAuditLog(prisma, {
    branchId: current.recipe.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "recipe_ingredient",
    entityId: id,
    entityName: `${current.recipe.name} — ${current.ingredient.name}`,
  });

  return { success: true };
}
```

- [ ] **Step 4: Create `features/recipes/actions/recipes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import {
  createRecipe,
  updateRecipe,
  softDeleteRecipe,
  addRecipeIngredient,
  removeRecipeIngredient,
} from "./recipes";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "recipe-1",
    branchId: "branch-1",
    name: "ชาไทยเย็น",
    yield: { toString: () => "1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createRecipe", () => {
  it("records a created audit log entry", async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null as never);
    prismaMock.recipe.create.mockResolvedValue(recipeRow() as never);

    await createRecipe({ name: "ชาไทยเย็น", yield: 1 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "recipe" }),
      }),
    );
  });
});

describe("updateRecipe", () => {
  it("records an updated entry when the yield changes", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(
      recipeRow({ yield: { toString: () => "1" } }) as never,
    );
    prismaMock.recipe.findFirst.mockResolvedValue(null as never);
    prismaMock.recipe.update.mockResolvedValue({} as never);

    await updateRecipe("recipe-1", { name: "ชาไทยเย็น", yield: 2 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([{ field: "yield", oldValue: "1", newValue: "2" }]),
        }),
      }),
    );
  });
});

describe("softDeleteRecipe", () => {
  it("records a deleted entry", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(recipeRow() as never);
    prismaMock.recipe.update.mockResolvedValue({} as never);

    await softDeleteRecipe("recipe-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "recipe" }),
      }),
    );
  });
});

describe("addRecipeIngredient / removeRecipeIngredient", () => {
  it("addRecipeIngredient records a created entry", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(recipeRow() as never);
    prismaMock.ingredient.findUnique.mockResolvedValue({
      id: "ing-1",
      name: "ไข่มุก",
      baseUnit: "gram",
    } as never);
    prismaMock.recipeIngredient.create.mockResolvedValue({
      id: "ri-1",
      quantity: { toString: () => "30" },
    } as never);

    await addRecipeIngredient("recipe-1", { ingredientId: "ing-1", quantity: 30 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "recipe_ingredient" }),
      }),
    );
  });

  it("removeRecipeIngredient records a deleted entry", async () => {
    prismaMock.recipeIngredient.findUnique.mockResolvedValue({
      id: "ri-1",
      recipe: recipeRow(),
      ingredient: { name: "ไข่มุก" },
    } as never);
    prismaMock.recipeIngredient.delete.mockResolvedValue({} as never);

    await removeRecipeIngredient("ri-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "recipe_ingredient" }),
      }),
    );
  });
});
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run features/recipes/actions/recipes.test.ts && npx tsc --noEmit -p tsconfig.json && npx eslint features/recipes`
Expected: all pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add features/recipes/actions/recipes.ts features/recipes/actions/recipes.test.ts
git commit -m "feat: record audit log entries for recipe changes"
```

---

### Task 10: Instrument `features/purchases/actions/suppliers.ts`

**Files:**

- Modify: `features/purchases/actions/suppliers.ts`
- Modify/Create: `features/purchases/actions/suppliers.test.ts` (check with Glob first)

- [ ] **Step 1: Add the import**

```ts
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
```

- [ ] **Step 2: `createSupplier` / `updateSupplier` / `softDeleteSupplier`**

```ts
export async function createSupplier(input: SupplierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existing = await prisma.supplier.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

  const supplier = await prisma.supplier.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      contactInfo: result.data.contactInfo || null,
      createdBy: actor.id,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "supplier",
    entityId: supplier.id,
    entityName: supplier.name,
    changes: snapshotFields(supplier, ["name", "contactInfo"]),
  });

  return { success: true, supplier };
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.supplier.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบผู้จำหน่าย" };

  const existing = await prisma.supplier.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

  await prisma.supplier.update({
    where: { id },
    data: {
      name: result.data.name,
      contactInfo: result.data.contactInfo || null,
      updatedBy: actor.id,
    },
  });

  const changes = diffFields(
    current,
    { name: result.data.name, contactInfo: result.data.contactInfo || null },
    ["name", "contactInfo"],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "supplier",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteSupplier(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบผู้จำหน่าย") };
  }

  const current = await prisma.supplier.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบผู้จำหน่าย" };

  await prisma.supplier.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "supplier",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}
```

- [ ] **Step 3: Create `features/purchases/actions/suppliers.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import { createSupplier, updateSupplier, softDeleteSupplier } from "./suppliers";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

function supplierRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sup-1",
    branchId: "branch-1",
    name: "Makobrand.th",
    contactInfo: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createSupplier", () => {
  it("records a created audit log entry", async () => {
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue(supplierRow() as never);

    await createSupplier({ name: "Makobrand.th", contactInfo: "" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "supplier" }),
      }),
    );
  });
});

describe("updateSupplier", () => {
  it("records an updated entry when contactInfo changes", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(supplierRow({ contactInfo: null }) as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.update.mockResolvedValue({} as never);

    await updateSupplier("sup-1", { name: "Makobrand.th", contactInfo: "080-000-0000" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([
            { field: "contactInfo", oldValue: null, newValue: "080-000-0000" },
          ]),
        }),
      }),
    );
  });
});

describe("softDeleteSupplier", () => {
  it("records a deleted entry", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(supplierRow() as never);
    prismaMock.supplier.update.mockResolvedValue({} as never);

    await softDeleteSupplier("sup-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "supplier" }),
      }),
    );
  });
});
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run features/purchases/actions/suppliers.test.ts && npx tsc --noEmit -p tsconfig.json && npx eslint features/purchases`
Expected: all pass, no errors.

- [ ] **Step 5: Commit**

```bash
git add features/purchases/actions/suppliers.ts features/purchases/actions/suppliers.test.ts
git commit -m "feat: record audit log entries for supplier changes"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `npx eslint .`
Expected: no errors (or only pre-existing warnings unrelated to this plan's files).

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: every test passes, including all new/extended files from Tasks 2, 4, 6, 7, 8, 9, 10.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. As an owner, in one browser session: create an ingredient, edit its cost, delete a test menu category, add a modifier, edit a supplier's contact info. Then open `/history` — expected: each action appears as a new row, newest first, with the correct actor name, action label, entity type/name, and a working "ดูรายละเอียด" dialog showing the right old→new values for the edits. Confirm the entity-type filter and search box narrow the list correctly, and pagination controls behave when there are more than 20 rows (or note that this wasn't reachable with test data and should be spot-checked once real usage accumulates rows).

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: audit log wave 1 verification pass"
```

(Skip this commit if step 4 required no code changes — don't create an empty commit.)
