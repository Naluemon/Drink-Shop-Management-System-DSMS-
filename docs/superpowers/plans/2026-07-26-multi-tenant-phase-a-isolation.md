# Multi-Tenant Phase A: Data Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DSMS's data model and every query genuinely multi-tenant-safe — a new `Organization` boundary above the existing `Branch`, enforced by both application-code filtering and Postgres Row-Level Security — with zero visible change for the existing shop, before any self-service signup (Phase B, separate plan) is allowed to create a second tenant.

**Architecture:** Add an `Organization` model; give every currently-unscoped table (`User`, `UserInvite`, `CompanySettings`, `TaxSettings`, `ReasonCode`, `Branch`) a required `organization_id`; every other business table already carries `branch_id` and inherits org scope transitively once `Branch` points at an `Organization`. A new `lib/tenant-scope.ts` replaces every action file's duplicated `getActor()` with one helper that also resolves `organizationId`/`branchId`, plus a `withOrgScope()` transaction wrapper that sets a Postgres session variable RLS policies check — so isolation holds even if an app-layer `where` filter is missed.

**Tech Stack:** Next.js 16 App Router, Prisma ORM 7 (`prisma-client` generator, `@prisma/adapter-pg`), Supabase Auth + Postgres, Vitest + `vitest-mock-extended`.

## Global Constraints

- Never run a schema migration or backfill directly against the production database (`wxhxhndpqvfwhfhkkirn`) without first applying and verifying it against the local/dev database (`bimfidnypmigkukodxfv`).
- Every new/changed query must go through `withOrgScope()` — never call the top-level `prisma` singleton directly from inside an action function once this plan is applied to that file.
- `npm run test` (Vitest) and `npx tsc --noEmit` must both pass after every task before committing.
- Follow the existing code style: Thai user-facing strings, `"use server"` at the top of every actions file, `permissionErrorMessage()` pattern for `PermissionError` unwrapping — do not introduce a different error-handling convention.
- This plan covers only the 7 action-file modules verified in this session (`ingredients`, `suppliers`, `menus`, `modifier-groups`, `inventory`, `purchase-orders`, `expense`). The remaining modules (`recipes`, `checkout`, `void-refund`, `pos-menu`, `reports`, `dashboard`, `company-settings`, `manage-users`, `invite`) are explicitly out of scope — see "Follow-up" at the end of this document.

---

## Task 1: Organization model, schema changes, and production-safe backfill migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_organization_tenant_scope/migration.sql` (via `prisma migrate dev --create-only`, then hand-edited)
- Test: `prisma/verify-org-backfill.ts` (one-off verification script, not a permanent test file)

**Interfaces:**

- Produces: `Organization` model (`id`, `name`, `createdAt`, `updatedAt`); `Branch.organizationId`, `User.organizationId`, `UserInvite.organizationId`, `CompanySettings.organizationId` (unique), `TaxSettings.organizationId` (unique), `ReasonCode.organizationId` — all required, all FK to `Organization.id`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add the new model right before `model Branch {` (currently at line 129):

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  branches        Branch[]
  users           User[]
  invites         UserInvite[]
  companySettings CompanySettings?
  taxSettings     TaxSettings?
  reasonCodes     ReasonCode[]

  @@map("organizations")
}
```

Replace `model Branch { ... }` with:

```prisma
model Branch {
  id             String       @id @default(uuid())
  organizationId String       @map("organization_id")
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  isActive       Boolean      @default(true) @map("is_active")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  @@map("branches")
}
```

Replace `model User { ... }` with:

```prisma
model User {
  id               String       @id @default(uuid())
  organizationId   String       @map("organization_id")
  organization     Organization @relation(fields: [organizationId], references: [id])
  email            String       @unique
  fullName         String       @map("full_name")
  role             UserRole
  isActive         Boolean      @default(true) @map("is_active")
  failedLoginCount Int          @default(0) @map("failed_login_count")
  lockedUntil      DateTime?    @map("locked_until")
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")

  invitesSent UserInvite[] @relation("InvitedBy")

  @@map("users")
}
```

Replace `model UserInvite { ... }` with:

```prisma
model UserInvite {
  id             String       @id @default(uuid())
  organizationId String       @map("organization_id")
  organization   Organization @relation(fields: [organizationId], references: [id])
  email          String
  role           UserRole
  invitedById    String       @map("invited_by")
  invitedBy      User         @relation("InvitedBy", fields: [invitedById], references: [id])
  token          String       @unique
  expiresAt      DateTime     @map("expires_at")
  acceptedAt     DateTime?    @map("accepted_at")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@index([email])
  @@map("user_invites")
}
```

In `model CompanySettings { ... }`, add right after the `id` line:

```prisma
  organizationId       String             @unique @map("organization_id")
  organization         Organization       @relation(fields: [organizationId], references: [id])
```

In `model TaxSettings { ... }`, add right after the `id` line:

```prisma
  organizationId          String       @unique @map("organization_id")
  organization            Organization @relation(fields: [organizationId], references: [id])
```

In `model ReasonCode { ... }`, add right after the `id` line:

```prisma
  organizationId String       @map("organization_id")
  organization   Organization @relation(fields: [organizationId], references: [id])
```

- [ ] **Step 2: Generate an empty migration to hand-edit**

Run: `npx prisma migrate dev --name add_organization_tenant_scope --create-only`

This produces a new file at `prisma/migrations/<timestamp>_add_organization_tenant_scope/migration.sql` containing Prisma's auto-generated `CREATE TABLE`/`ALTER TABLE` statements. It will fail if applied as-is, because the new `organization_id` columns are `NOT NULL` with no default and existing rows have no value — that's expected; do not apply it yet.

- [ ] **Step 3: Rewrite the generated migration.sql to backfill safely**

Replace the entire contents of that migration file with (adjust the auto-generated `CREATE TABLE "organizations"` block's exact column types if Prisma generated something different — verify against Step 2's output first):

```sql
-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Seed exactly one organization for all data that exists before this migration runs.
-- Every environment this migration is ever applied to (local dev, production) has
-- only ever had one shop's worth of data, so a single backfill target is correct.
INSERT INTO "organizations" ("id", "name", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'ร้านของคุณ', now(), now());

-- AlterTable: add nullable FK columns first so the backfill below can run
ALTER TABLE "branches" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "users" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "user_invites" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "tax_settings" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "reason_codes" ADD COLUMN "organization_id" TEXT;

-- Backfill every existing row to the one seeded organization
UPDATE "branches" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "users" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "user_invites" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "company_settings" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "tax_settings" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "reason_codes" SET "organization_id" = '00000000-0000-0000-0000-000000000001';

-- Now safe to enforce NOT NULL
ALTER TABLE "branches" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "user_invites" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "company_settings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tax_settings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "reason_codes" ALTER COLUMN "organization_id" SET NOT NULL;

-- One settings row per organization
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_key" UNIQUE ("organization_id");
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_organization_id_key" UNIQUE ("organization_id");

-- Foreign keys
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reason_codes" ADD CONSTRAINT "reason_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration to local dev and generate the client**

Run: `npx prisma migrate dev` (applies the hand-edited migration), then `npx prisma generate`

- [ ] **Step 5: Write and run the backfill verification script**

Create `prisma/verify-org-backfill.ts`:

```typescript
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const orgCount = await prisma.organization.count();
  const nullBranch = await prisma.branch.count(); // all rows must now have organizationId set (NOT NULL enforced by schema)
  const orgs = await prisma.organization.findMany();
  const branches = await prisma.branch.findMany({ select: { id: true, organizationId: true } });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, organizationId: true },
  });

  console.log(`Organizations: ${orgCount}`);
  console.log(`Branches (all must share one organizationId): ${JSON.stringify(branches)}`);
  console.log(`Users (all must share one organizationId): ${JSON.stringify(users)}`);

  if (orgCount !== 1) throw new Error(`Expected exactly 1 organization, found ${orgCount}`);
  const orgId = orgs[0].id;
  if (branches.some((b) => b.organizationId !== orgId)) throw new Error("Branch backfill mismatch");
  if (users.some((u) => u.organizationId !== orgId)) throw new Error("User backfill mismatch");

  console.log("Backfill verified OK.");
}

main().finally(() => prisma.$disconnect());
```

Run: `npx tsx prisma/verify-org-backfill.ts`
Expected: prints `Backfill verified OK.` with no thrown error.

- [ ] **Step 6: Delete the verification script and commit**

```bash
rm prisma/verify-org-backfill.ts
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Organization tenant model, backfill existing data"
```

---

## Task 2: Enable Postgres Row-Level Security as defense-in-depth

**Files:**

- Create: `prisma/migrations/<timestamp>_enable_row_level_security/migration.sql`
- Test: `prisma/verify-rls.ts` (one-off verification script)

**Interfaces:**

- Consumes: `Organization`, `Branch.organizationId` from Task 1.
- Produces: RLS enabled + a `tenant_isolation` policy on every tenant-scoped table, keyed off the Postgres session setting `app.current_org_id`.

- [ ] **Step 1: Create the migration directory and file**

Run: `npx prisma migrate dev --name enable_row_level_security --create-only`

This produces an empty `migration.sql` (no schema.prisma changes triggered it) — replace its contents with the SQL below.

- [ ] **Step 2: Write the RLS policies**

```sql
-- Tables with a direct organization_id column
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches', 'users', 'user_invites', 'company_settings', 'tax_settings', 'reason_codes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = current_setting(''app.current_org_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- Tables with a direct branch_id column: check branch belongs to the current org
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'ingredients', 'recipes', 'menu_categories', 'menus', 'modifier_groups', 'purchase_orders', 'inventory_movements', 'sales_transactions', 'expense_categories', 'expense_entries']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (branch_id IN (SELECT id FROM branches WHERE organization_id = current_setting(''app.current_org_id'', true)::uuid))',
      t
    );
  END LOOP;
END $$;

-- Child tables with no branch_id of their own: join to their parent's branch_id
ALTER TABLE "unit_conversions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "unit_conversions" USING (
  ingredient_id IN (SELECT id FROM ingredients WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recipe_ingredients" USING (
  recipe_id IN (SELECT id FROM recipes WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "menu_variants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_variants" USING (
  menu_id IN (SELECT id FROM menus WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "menu_modifier_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_modifier_groups" USING (
  menu_id IN (SELECT id FROM menus WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "modifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "modifiers" USING (
  modifier_group_id IN (SELECT id FROM modifier_groups WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order_items" USING (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "refund_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refund_requests" USING (
  sales_transaction_id IN (SELECT id FROM sales_transactions WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "sales_transaction_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_transaction_items" USING (
  sales_transaction_id IN (SELECT id FROM sales_transactions WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
  ))
);

ALTER TABLE "sales_transaction_item_modifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_transaction_item_modifiers" USING (
  sales_transaction_item_id IN (SELECT id FROM sales_transaction_items WHERE sales_transaction_id IN (
    SELECT id FROM sales_transactions WHERE branch_id IN (
      SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)::uuid
    )
  ))
);
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate dev`

- [ ] **Step 4: Write and run the RLS verification script**

This connects directly with `pg` (bypassing Prisma entirely) to prove the policy actually blocks cross-org reads — this is the test that justifies calling RLS "defense in depth" rather than decoration.

Create `prisma/verify-rls.ts`:

```typescript
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // A random UUID that is NOT the real seeded organization's id — with RLS
  // active and this set as the session's current org, every tenant-scoped
  // table must return zero rows, even though real rows exist in the DB.
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [
    "99999999-9999-9999-9999-999999999999",
  ]);

  const branches = await client.query('SELECT * FROM "branches"');
  const users = await client.query('SELECT * FROM "users"');
  const ingredients = await client.query('SELECT * FROM "ingredients"');

  await client.query("ROLLBACK");
  await client.end();

  console.log(
    `With a fake org_id set: branches=${branches.rowCount}, users=${users.rowCount}, ingredients=${ingredients.rowCount}`,
  );

  if (branches.rowCount !== 0 || users.rowCount !== 0 || ingredients.rowCount !== 0) {
    throw new Error("RLS FAILED to isolate — rows leaked across the fake org boundary!");
  }

  console.log("RLS verified OK: zero rows visible outside the current org.");
}

main();
```

Run: `npx tsx prisma/verify-rls.ts`
Expected: prints `RLS verified OK: zero rows visible outside the current org.`

**Important**: if this fails or errors instead, the most likely cause is that the Postgres role Prisma connects as has `BYPASSRLS` (superuser-like) privilege — Supabase's default `postgres` role does. If so, RLS policies are silently ignored for that role. This must be resolved (e.g. connect as a non-bypassing role for app traffic, or explicitly `ALTER ROLE ... NOBYPASSRLS` if permitted) before this task can be considered done — do not mark this task complete with a passing app but a role that bypasses RLS, since that defeats the entire point of Layer 2.

- [ ] **Step 5: Delete the verification script and commit**

```bash
rm prisma/verify-rls.ts
git add prisma/migrations
git commit -m "feat: enable Postgres RLS as defense-in-depth for tenant isolation"
```

---

## Task 3: `lib/tenant-scope.ts` — shared actor/org resolution and scoped transaction helper

**Files:**

- Create: `lib/tenant-scope.ts`
- Create: `lib/tenant-scope.test.ts`
- Modify: `lib/default-branch.ts`

**Interfaces:**

- Consumes: `prisma` from `lib/prisma.ts`; `createClient` from `lib/supabase/server.ts`.
- Produces:
  - `getActorWithOrg(): Promise<{ actor: User; organizationId: string; branchId: string } | null>`
  - `withOrgScope<T>(organizationId: string, callback: (tx: TransactionClient) => Promise<T>): Promise<T>` — `TransactionClient` inferred from `prisma.$transaction`'s own callback parameter type
  - `getOrCreateDefaultBranch(organizationId: string): Promise<Branch>` (updated signature)

- [ ] **Step 1: Write the failing test**

Create `lib/tenant-scope.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActorWithOrg, withOrgScope } from "./tenant-scope";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("getActorWithOrg", () => {
  it("returns null when not logged in", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    });

    const result = await getActorWithOrg();
    expect(result).toBeNull();
  });

  it("resolves actor, organizationId, and branchId when logged in", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
      email: "a@b.com",
      fullName: "A",
      role: "owner",
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    prismaMock.branch.findFirst.mockResolvedValue({
      id: "branch-1",
      organizationId: "org-1",
      name: "สาขาหลัก",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getActorWithOrg();
    expect(result).toEqual({
      actor: expect.objectContaining({ id: "user-1", organizationId: "org-1" }),
      organizationId: "org-1",
      branchId: "branch-1",
    });
  });

  it("returns null if the user's organization has no branch yet", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
    } as never);
    prismaMock.branch.findFirst.mockResolvedValue(null);

    const result = await getActorWithOrg();
    expect(result).toBeNull();
  });
});

describe("withOrgScope", () => {
  it("sets the session org before running the callback, inside a transaction", async () => {
    const txMock = mockDeep<PrismaClient>();
    prismaMock.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) =>
      cb(txMock)) as never);

    const callback = vi.fn().mockResolvedValue("result");
    const result = await withOrgScope("org-1", callback);

    expect(txMock.$executeRaw).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(txMock);
    expect(result).toBe("result");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tenant-scope.test.ts`
Expected: FAIL with "Cannot find module './tenant-scope'"

- [ ] **Step 3: Write `lib/tenant-scope.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/generated/prisma/client";

export interface ActorWithOrg {
  actor: User;
  organizationId: string;
  branchId: string;
}

// Resolves the logged-in Supabase user to their Prisma User row plus their
// organization and (single, for now — multi-branch-per-org is a future
// feature, not part of this conversion) branch. Replaces every action
// file's duplicated getActor(). Returns null if not logged in, the user
// row doesn't exist yet, or their organization somehow has no branch.
//
// The two lookups below (user by auth id, branch by the resolved
// organizationId) are intentionally NOT wrapped in withOrgScope(): each is
// keyed by a value that already narrows to at most one tenant (the
// caller's own Supabase auth id; then that same user's own
// organizationId), so there's no cross-tenant read to guard against here.
// Every OTHER query in the app, once this actor is resolved, must go
// through withOrgScope() below.
export async function getActorWithOrg(): Promise<ActorWithOrg | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const actor = await prisma.user.findUnique({ where: { id: user.id } });
  if (!actor) return null;

  const branch = await prisma.branch.findFirst({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) return null;

  return { actor, organizationId: actor.organizationId, branchId: branch.id };
}

// Wraps `callback` in a transaction that sets the Postgres session variable
// the RLS policies check (prisma/migrations/<ts>_enable_row_level_security),
// scoped to just that transaction via set_config(..., true) — the third
// argument makes it equivalent to SET LOCAL, so it can never leak onto a
// later request that reuses the same pooled connection. `callback` receives
// the transaction client, not the top-level `prisma` singleton — every
// query made through it is protected by RLS even if its own `where` clause
// forgets to filter by branch/org.
// Grabs the type of the transaction client Prisma's own $transaction()
// callback receives, instead of naming a generated type that may not exist
// under the same name across Prisma versions/generators.
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function withOrgScope<T>(
  organizationId: string,
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return callback(tx);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tenant-scope.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Update `lib/default-branch.ts` to be organization-scoped**

Replace the entire file:

```typescript
import { prisma } from "@/lib/prisma";

// DATABASE.md §2: every business table gets branch_id from Phase 3 onward.
// Post-Phase-A-multi-tenant: scoped per organization — each org gets its
// own single default branch, auto-created on first use. Multi-branch-per-
// organization is a future feature, not part of this conversion.
export async function getOrCreateDefaultBranch(organizationId: string) {
  const existing = await prisma.branch.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.branch.create({ data: { name: "สาขาหลัก", organizationId } });
}
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors (some action files will now show errors from the changed `getOrCreateDefaultBranch` signature — these are fixed in Tasks 5-11; if working through this plan in order, expect and ignore those specific errors until this task's own files are clean)

```bash
git add lib/tenant-scope.ts lib/tenant-scope.test.ts lib/default-branch.ts
git commit -m "feat: add tenant-scope helper (org/branch resolution + RLS-aware transaction wrapper)"
```

---

## Task 4: Convert `features/ingredients/actions/ingredients.ts`

**Files:**

- Modify: `features/ingredients/actions/ingredients.ts`

**Interfaces:**

- Consumes: `getActorWithOrg`, `withOrgScope` from `lib/tenant-scope.ts`; `getOrCreateDefaultBranch(organizationId)` from Task 3.

- [ ] **Step 1: Replace the entire file**

```typescript
"use server";

import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import {
  ingredientSchema,
  IngredientInput,
  unitConversionSchema,
  UnitConversionInput,
} from "../schemas/ingredient.schema";

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// FR-ING-01: CRUD ingredient พร้อม Search/Filter ตามชื่อ/supplier
export async function listIngredients(filters?: { search?: string; supplierId?: string }) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการวัตถุดิบ") };
  }

  const ingredients = await withOrgScope(organizationId, (tx) =>
    tx.ingredient.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(filters?.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
        ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
      },
      include: { supplier: true, unitConversions: true },
      orderBy: { name: "asc" },
    }),
  );

  return { ingredients };
}

export async function listSuppliers() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { organizationId, branchId } = ctx;

  const suppliers = await withOrgScope(organizationId, (tx) =>
    tx.supplier.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  );
  return { suppliers };
}

export async function createIngredient(input: IngredientInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }

  const result = ingredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existing = await tx.ingredient.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existing) return { error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" };

    const ingredient = await tx.ingredient.create({
      data: {
        branchId,
        name: result.data.name,
        baseUnit: result.data.baseUnit,
        costPerUnit: result.data.costPerUnit,
        lowStockThreshold:
          result.data.lowStockThreshold === "" || result.data.lowStockThreshold === undefined
            ? null
            : result.data.lowStockThreshold,
        supplierId: result.data.supplierId || null,
        createdBy: actor.id,
      },
    });

    return { success: true, ingredient };
  });
}

export async function updateIngredient(id: string, input: IngredientInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = ingredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.ingredient.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบวัตถุดิบ" };

    const existing = await tx.ingredient.findFirst({
      where: {
        branchId,
        deletedAt: null,
        id: { not: id },
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existing) return { error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" };

    await tx.ingredient.update({
      where: { id },
      data: {
        name: result.data.name,
        baseUnit: result.data.baseUnit,
        costPerUnit: result.data.costPerUnit,
        lowStockThreshold:
          result.data.lowStockThreshold === "" || result.data.lowStockThreshold === undefined
            ? null
            : result.data.lowStockThreshold,
        supplierId: result.data.supplierId || null,
        updatedBy: actor.id,
      },
    });

    return { success: true };
  });
}

// FR-ING-07: ลบแบบ soft-delete เท่านั้น (DATABASE.md §4 — อาจถูกอ้างอิงจาก recipe/PO เก่า)
export async function softDeleteIngredient(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "delete", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบวัตถุดิบ") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.ingredient.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบวัตถุดิบ" };

    await tx.ingredient.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.id },
    });
    return { success: true };
  });
}

// FR-ING-03: unit_conversions หลายรายการต่อ ingredient
export async function addUnitConversion(ingredientId: string, input: UnitConversionInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = unitConversionSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, branchId } });
    if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

    const conversion = await tx.unitConversion.create({
      data: {
        ingredientId,
        purchaseUnitName: result.data.purchaseUnitName,
        conversionFactor: result.data.conversionFactor,
      },
    });

    return { success: true, conversion };
  });
}

export async function deleteUnitConversion(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const conversion = await tx.unitConversion.findFirst({
      where: { id, ingredient: { branchId } },
    });
    if (!conversion) return { error: "ไม่พบข้อมูล" };

    await tx.unitConversion.delete({ where: { id } });
    return { success: true };
  });
}
```

Note: `getOrCreateDefaultBranch` is imported but unused directly in this file now (branch is resolved once via `getActorWithOrg`) — remove the import if `tsc`/`eslint` flags it as unused after this edit.

- [ ] **Step 2: Update the corresponding test file if one exists**

Run: `find features/ingredients -name "*.test.ts"` — if a test file exists, update its mocked `getActor`/`prisma.user.findUnique` calls to match the new `getActorWithOrg`/`withOrgScope` shape (mock `@/lib/tenant-scope` instead of `@/lib/prisma` directly), following the pattern in `lib/tenant-scope.test.ts` from Task 3.

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/ingredients`
Expected: no errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add features/ingredients
git commit -m "feat: scope ingredients actions to organization/branch"
```

---

## Task 5: Convert `features/purchases/actions/suppliers.ts`

**Files:**

- Modify: `features/purchases/actions/suppliers.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
"use server";

import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { supplierSchema, SupplierInput } from "../schemas/supplier.schema";

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

export async function listSuppliers() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูผู้จำหน่าย") };
  }

  const suppliers = await withOrgScope(organizationId, (tx) =>
    tx.supplier.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  );

  return { suppliers };
}

export async function createSupplier(input: SupplierInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existing = await tx.supplier.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

    const supplier = await tx.supplier.create({
      data: {
        branchId,
        name: result.data.name,
        contactInfo: result.data.contactInfo || null,
        createdBy: actor.id,
      },
    });

    return { success: true, supplier };
  });
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.supplier.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบผู้จำหน่าย" };

    const existing = await tx.supplier.findFirst({
      where: {
        branchId,
        deletedAt: null,
        id: { not: id },
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

    await tx.supplier.update({
      where: { id },
      data: {
        name: result.data.name,
        contactInfo: result.data.contactInfo || null,
        updatedBy: actor.id,
      },
    });

    return { success: true };
  });
}

export async function softDeleteSupplier(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "delete", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบผู้จำหน่าย") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.supplier.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบผู้จำหน่าย" };

    await tx.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.id },
    });
    return { success: true };
  });
}
```

- [ ] **Step 2: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/purchases`
Expected: no errors (some `purchase-orders.ts` errors expected until Task 8 — ignore those for now)

- [ ] **Step 3: Commit**

```bash
git add features/purchases/actions/suppliers.ts
git commit -m "feat: scope suppliers actions to organization/branch"
```

---

## Task 6: Convert `features/menus/actions/menus.ts` and `features/menus/actions/modifier-groups.ts`

**Files:**

- Modify: `features/menus/actions/menus.ts`
- Modify: `features/menus/actions/modifier-groups.ts`

- [ ] **Step 1: Replace `features/menus/actions/menus.ts`**

```typescript
"use server";

import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import {
  menuCategorySchema,
  MenuCategoryInput,
  menuSchema,
  MenuInput,
  menuVariantSchema,
  MenuVariantInput,
} from "../schemas/menu.schema";

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

export async function listMenuCategories() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { organizationId, branchId } = ctx;

  const categories = await withOrgScope(organizationId, (tx) =>
    tx.menuCategory.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  );
  return { categories };
}

export async function createMenuCategory(input: MenuCategoryInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างหมวดหมู่") };
  }

  const result = menuCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existingCategory = await tx.menuCategory.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

    const category = await tx.menuCategory.create({
      data: {
        branchId,
        name: result.data.name,
        type: result.data.type,
        createdBy: actor.id,
      },
    });

    return { success: true, category };
  });
}

// FR-MENU-01/02: list พร้อมต้นทุน recipe หลักคำนวณสด (ARCHITECTURE.md §3)
export async function listMenus() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูเมนู") };
  }

  const menus = await withOrgScope(organizationId, (tx) =>
    tx.menu.findMany({
      where: { branchId, deletedAt: null },
      include: {
        category: true,
        recipe: true,
        variants: { where: { deletedAt: null } },
        modifierGroups: { include: { modifierGroup: true } },
      },
      orderBy: { name: "asc" },
    }),
  );

  const menusWithCost = await Promise.all(
    menus.map(async (m) => ({
      id: m.id,
      name: m.name,
      basePrice: m.basePrice.toString(),
      imageUrl: m.imageUrl,
      isAvailable: m.isAvailable,
      categoryId: m.categoryId,
      categoryName: m.category?.name ?? null,
      recipeId: m.recipeId,
      recipeName: m.recipe.name,
      recipeCost: await calculateRecipeCost(m.recipeId),
      variants: m.variants.map((v) => ({
        id: v.id,
        name: v.name,
        recipeMultiplier: v.recipeMultiplier?.toString() ?? null,
        overrideRecipeId: v.overrideRecipeId,
        priceDelta: v.priceDelta.toString(),
        isDefault: v.isDefault,
      })),
      modifierGroupIds: m.modifierGroups.map((mg) => mg.modifierGroupId),
    })),
  );

  return { menus: menusWithCost };
}

export async function createMenu(input: MenuInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existingMenu = await tx.menu.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

    const menu = await tx.menu.create({
      data: {
        branchId,
        name: result.data.name,
        recipeId: result.data.recipeId,
        categoryId: result.data.categoryId || null,
        basePrice: result.data.basePrice,
        imageUrl: result.data.imageUrl || null,
        isAvailable: result.data.isAvailable,
        createdBy: actor.id,
      },
    });

    return { success: true, menu };
  });
}

export async function updateMenu(id: string, input: MenuInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.menu.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบเมนู" };

    const existingMenu = await tx.menu.findFirst({
      where: {
        branchId,
        deletedAt: null,
        id: { not: id },
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

    await tx.menu.update({
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

    return { success: true };
  });
}

// FR-MENU-07: ลบแบบ soft-delete เท่านั้น
export async function softDeleteMenu(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบเมนู") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.menu.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบเมนู" };

    await tx.menu.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.id },
    });
    return { success: true };
  });
}

// FR-MENU-03: menu_variant พร้อม recipe_multiplier หรือ override_recipe_id
export async function addMenuVariant(menuId: string, input: MenuVariantInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuVariantSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const menu = await tx.menu.findFirst({ where: { id: menuId, branchId } });
    if (!menu) return { error: "ไม่พบเมนู" };

    if (result.data.isDefault) {
      await tx.menuVariant.updateMany({ where: { menuId }, data: { isDefault: false } });
    }
    const variant = await tx.menuVariant.create({
      data: {
        menuId,
        name: result.data.name,
        recipeMultiplier: result.data.mode === "multiplier" ? result.data.recipeMultiplier : null,
        overrideRecipeId: result.data.mode === "override" ? result.data.overrideRecipeId : null,
        priceDelta: result.data.priceDelta,
        isDefault: result.data.isDefault,
      },
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
  });
}

export async function removeMenuVariant(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const variant = await tx.menuVariant.findFirst({ where: { id, menu: { branchId } } });
    if (!variant) return { error: "ไม่พบข้อมูล" };

    await tx.menuVariant.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  });
}

export async function setMenuModifierGroups(menuId: string, modifierGroupIds: string[]) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const menu = await tx.menu.findFirst({ where: { id: menuId, branchId } });
    if (!menu) return { error: "ไม่พบเมนู" };

    await tx.menuModifierGroup.deleteMany({ where: { menuId } });
    await tx.menuModifierGroup.createMany({
      data: modifierGroupIds.map((modifierGroupId) => ({ menuId, modifierGroupId })),
    });

    return { success: true };
  });
}

export async function getRecipeOptions() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { organizationId, branchId } = ctx;

  const recipes = await withOrgScope(organizationId, (tx) =>
    tx.recipe.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  );
  return { recipes };
}
```

- [ ] **Step 2: Replace `features/menus/actions/modifier-groups.ts`**

```typescript
"use server";

import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";
import { requirePermission, PermissionError } from "@/lib/permissions";
import {
  modifierGroupSchema,
  ModifierGroupInput,
  modifierSchema,
  ModifierInput,
} from "../schemas/modifier.schema";

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// FR-MENU-04/05: modifier_group + modifier — permission ผูกกับ resource "menu"
export async function listModifierGroups() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูกลุ่มตัวเลือก") };
  }

  const groups = await withOrgScope(organizationId, (tx) =>
    tx.modifierGroup.findMany({
      where: { branchId, deletedAt: null },
      include: { modifiers: { where: { deletedAt: null }, include: { ingredient: true } } },
      orderBy: { name: "asc" },
    }),
  );

  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      modifiers: g.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient?.name ?? null,
        ingredientQuantity: m.ingredientQuantity?.toString() ?? null,
        ingredientCostPerUnit: m.ingredient?.costPerUnit.toString() ?? null,
        priceDelta: m.priceDelta.toString(),
      })),
    })),
  };
}

export async function createModifierGroup(input: ModifierGroupInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existingGroup = await tx.modifierGroup.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

    const group = await tx.modifierGroup.create({
      data: {
        branchId,
        name: result.data.name,
        selectionType: result.data.selectionType,
        isRequired: result.data.isRequired,
      },
    });

    return { success: true, group };
  });
}

export async function updateModifierGroup(id: string, input: ModifierGroupInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.modifierGroup.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบกลุ่มตัวเลือก" };

    const existingGroup = await tx.modifierGroup.findFirst({
      where: {
        branchId,
        deletedAt: null,
        id: { not: id },
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

    await tx.modifierGroup.update({
      where: { id },
      data: {
        name: result.data.name,
        selectionType: result.data.selectionType,
        isRequired: result.data.isRequired,
      },
    });

    return { success: true };
  });
}

export async function softDeleteModifierGroup(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบกลุ่มตัวเลือก") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.modifierGroup.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบกลุ่มตัวเลือก" };

    await tx.modifierGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  });
}

export async function addModifier(modifierGroupId: string, input: ModifierInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const group = await tx.modifierGroup.findFirst({ where: { id: modifierGroupId, branchId } });
    if (!group) return { error: "ไม่พบกลุ่มตัวเลือก" };

    const existingModifier = await tx.modifier.findFirst({
      where: {
        modifierGroupId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingModifier) return { error: "มีตัวเลือกชื่อนี้อยู่ในกลุ่มนี้แล้ว" };

    const modifier = await tx.modifier.create({
      data: {
        modifierGroupId,
        name: result.data.name,
        ingredientId: result.data.ingredientId || null,
        ingredientQuantity: result.data.ingredientQuantity ?? null,
        priceDelta: result.data.priceDelta,
      },
      include: { ingredient: true },
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
  });
}

export async function removeModifier(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const modifier = await tx.modifier.findFirst({
      where: { id, modifierGroup: { branchId } },
    });
    if (!modifier) return { error: "ไม่พบข้อมูล" };

    await tx.modifier.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  });
}
```

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/menus`
Expected: no errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add features/menus
git commit -m "feat: scope menus and modifier-groups actions to organization/branch"
```

---

## Task 7: Convert `features/inventory/actions/inventory.ts`

**Files:**

- Modify: `features/inventory/actions/inventory.ts`

**Interfaces:**

- Consumes: `DEFAULT_PAGE_SIZE`, `getSkip`, `getTotalPages` from `lib/pagination.ts`; `getOrCreateCompanySettings` from `lib/settings.ts`; `resolveStockDeficitPolicy`, `StockDeficitBlockedError` from `lib/stock-deficit-policy.ts` (all unchanged, only the actor/scope pattern changes here).

**Note on `getOrCreateCompanySettings()`:** this still returns the single pre-existing `CompanySettings` row during Phase A, which is correct as long as only one organization exists (true until Phase B ships self-service signup). `features/settings/actions/company-settings.ts` and `lib/settings.ts` are listed in this plan's Follow-up section — they must become organization-scoped before Phase B, but are out of scope here.

- [ ] **Step 1: Replace the entire file**

```typescript
"use server";

import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateCompanySettings } from "@/lib/settings";
import { resolveStockDeficitPolicy, StockDeficitBlockedError } from "@/lib/stock-deficit-policy";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages } from "@/lib/pagination";
import {
  stockInSchema,
  StockInInput,
  stockOutSchema,
  StockOutInput,
  adjustmentSchema,
  AdjustmentInput,
} from "../schemas/inventory.schema";

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// FR-ING-06/FR-INV-04: current stock + low-stock threshold per ingredient —
// reuses the same Ingredient rows Phase 3 already exposes at /ingredients.
export async function listStockLevels() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสต็อก") };
  }

  const ingredients = await withOrgScope(organizationId, (tx) =>
    tx.ingredient.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  );

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      currentStockQty: i.currentStockQty.toString(),
      lowStockThreshold: i.lowStockThreshold?.toString() ?? null,
    })),
  };
}

// FR-INV-05: append-only ledger — every change is InventoryMovement + the
// Ingredient.currentStockQty update in one atomic transaction (AGENTS.md §4).
export async function recordStockIn(input: StockInInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "stock_in");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์รับสินค้าเข้าสต็อก") };
  }

  const result = stockInSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: result.data.ingredientId, branchId },
    });
    if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

    const m = await tx.inventoryMovement.create({
      data: {
        branchId,
        ingredientId: result.data.ingredientId,
        movementType: "stock_in",
        quantity: result.data.quantity,
        referenceType: result.data.note ? "manual_note" : null,
        referenceId: null,
        createdBy: actor.id,
      },
    });
    await tx.ingredient.update({
      where: { id: result.data.ingredientId },
      data: { currentStockQty: { increment: result.data.quantity } },
    });

    return { success: true, movementId: m.id };
  });
}

// FR-INV-02: stock_out ต้องมี reason_code จากลิสต์เสมอ (D12) — D4: สต็อกไม่พอ
// ยังทำต่อได้ (non-blocking) แต่ flag is_stock_deficit ไว้ให้ Manager/Owner เห็น
export async function recordStockOut(input: StockOutInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "stock_out");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ตัดสต็อกออก") };
  }

  const result = stockOutSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  // Not organization-scoped yet (see the note above this task) — reason
  // codes and company settings are still system-wide singletons in Phase A,
  // which is correct as long as only one org exists.
  const companySettings = await getOrCreateCompanySettings();

  try {
    return await withOrgScope(organizationId, async (tx) => {
      const validReasonCode = await tx.reasonCode.findFirst({
        where: { code: result.data.reasonCode, isActive: true, deletedAt: null },
      });
      if (!validReasonCode) return { error: "เหตุผลที่เลือกไม่ถูกต้องหรือถูกปิดใช้งานแล้ว" };

      const ingredient = await tx.ingredient.findFirst({
        where: { id: result.data.ingredientId, branchId },
      });
      if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

      const deficit = Number(ingredient.currentStockQty) < result.data.quantity;

      if (deficit) {
        const policy = resolveStockDeficitPolicy(
          ingredient.stockDeficitPolicyOverride,
          companySettings.stockDeficitPolicy,
        );
        if (policy === "strict_block") throw new StockDeficitBlockedError(ingredient.name);
      }

      const m = await tx.inventoryMovement.create({
        data: {
          branchId,
          ingredientId: result.data.ingredientId,
          movementType: "stock_out",
          quantity: result.data.quantity,
          reasonCode: result.data.reasonCode,
          isStockDeficit: deficit,
          createdBy: actor.id,
        },
      });
      await tx.ingredient.update({
        where: { id: result.data.ingredientId },
        data: { currentStockQty: { decrement: result.data.quantity } },
      });

      return { success: true, movementId: m.id, isStockDeficit: deficit };
    });
  } catch (e) {
    if (e instanceof StockDeficitBlockedError) {
      return {
        error: `สต็อก "${e.ingredientName}" ไม่พอ และตั้งค่าเป็นบล็อกเข้มงวดไว้ (Settings) — กรุณารับสต็อกเข้าก่อนหรือปรับจำนวน`,
      };
    }
    throw e;
  }
}

// FR-INV-03 / DECISIONS.md D12: adjustment อิสระ จำกัด Manager/Owner เท่านั้น
export async function recordAdjustment(input: AdjustmentInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "adjustment");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ปรับปรุงสต็อกอิสระ") };
  }

  const result = adjustmentSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: result.data.ingredientId, branchId },
    });
    if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

    const m = await tx.inventoryMovement.create({
      data: {
        branchId,
        ingredientId: result.data.ingredientId,
        movementType: "adjustment",
        quantity: result.data.delta,
        reasonCode: result.data.note || null,
        createdBy: actor.id,
      },
    });
    await tx.ingredient.update({
      where: { id: result.data.ingredientId },
      data: { currentStockQty: { increment: result.data.delta } },
    });

    return { success: true, movementId: m.id };
  });
}

// Movement log — matches SECURITY.md §1's Inventory rows: only Owner/Manager
// have anything beyond bare "Create" on stock_in/stock_out/adjustment, so
// only they get to browse the ledger itself.
export async function listRecentMovements(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  const canViewLedger = actor.role === "owner" || actor.role === "manager";
  if (!canViewLedger) {
    return { error: "คุณไม่มีสิทธิ์ดูประวัติการเคลื่อนไหวสต็อก" };
  }

  return withOrgScope(organizationId, async (tx) => {
    const [movements, total] = await Promise.all([
      tx.inventoryMovement.findMany({
        where: { branchId },
        skip: getSkip(page, pageSize),
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { ingredient: true },
      }),
      tx.inventoryMovement.count({ where: { branchId } }),
    ]);

    return {
      movements: movements.map((m) => ({
        id: m.id,
        ingredientName: m.ingredient.name,
        baseUnit: m.ingredient.baseUnit,
        movementType: m.movementType,
        quantity: m.quantity.toString(),
        reasonCode: m.reasonCode,
        isStockDeficit: m.isStockDeficit,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: getTotalPages(total, pageSize),
    };
  });
}
```

(Note: `Promise.all` replaces `prisma.$transaction([findMany, count])` in `listRecentMovements` — it's already running inside `withOrgScope`'s outer transaction, and Prisma does not support nesting `$transaction` calls; `Promise.all` against the same `tx` client is the correct way to run two reads concurrently within an already-open transaction.)

- [ ] **Step 2: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/inventory`
Expected: no errors, all tests pass (update `features/inventory/actions/inventory.test.ts`'s mocks to match the new `getActorWithOrg`/`withOrgScope` shape, same as Task 3's test pattern)

- [ ] **Step 3: Commit**

```bash
git add features/inventory
git commit -m "feat: scope inventory actions to organization/branch"
```

---

## Task 8: Convert `features/purchases/actions/purchase-orders.ts`

**Files:**

- Modify: `features/purchases/actions/purchase-orders.ts`

- [ ] **Step 1: Update `listPurchaseOrders`**

Apply the same actor/scope pattern as Task 7. The paginated list function (already updated for pagination in earlier work) becomes:

```typescript
export async function listPurchaseOrders(
  filters?: { supplierId?: string; from?: string; to?: string },
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูใบสั่งซื้อ") };
  }

  const where = {
    branchId,
    ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters?.from || filters?.to
      ? {
          orderedAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  return withOrgScope(organizationId, async (tx) => {
    const [orders, total, pendingCount] = await Promise.all([
      tx.purchaseOrder.findMany({
        where,
        include: { supplier: true, items: { include: { ingredient: true } } },
        orderBy: { orderedAt: "desc" },
        skip: getSkip(page, pageSize),
        take: pageSize,
      }),
      tx.purchaseOrder.count({ where }),
      tx.purchaseOrder.count({ where: { ...where, status: "pending" } }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        supplierId: o.supplierId,
        supplierName: o.supplier.name,
        orderedAt: o.orderedAt.toISOString(),
        receivedAt: o.receivedAt?.toISOString() ?? null,
        items: o.items.map((it) => ({
          id: it.id,
          ingredientId: it.ingredientId,
          ingredientName: it.ingredient.name,
          purchaseUnitName: it.purchaseUnitName,
          quantity: it.quantity.toString(),
          unitPrice: it.unitPrice.toString(),
        })),
      })),
      total,
      page,
      totalPages: getTotalPages(total, pageSize),
      pendingCount,
    };
  });
}
```

(Note: `Promise.all` replaces the earlier `prisma.$transaction([...])` array form for the same nesting reason as Task 7.)

- [ ] **Step 2: Update `createPurchaseOrder`**

```typescript
export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างใบสั่งซื้อ") };
  }

  const result = purchaseOrderSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: result.data.supplierId, branchId },
    });
    if (!supplier) return { error: "ไม่พบผู้จำหน่าย" };

    const order = await tx.purchaseOrder.create({
      data: {
        branchId,
        supplierId: result.data.supplierId,
        status: "pending",
        createdBy: actor.id,
      },
      include: { supplier: true },
    });

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        supplierId: order.supplierId,
        supplierName: order.supplier.name,
        orderedAt: order.orderedAt.toISOString(),
        receivedAt: null,
        items: [] as never[],
      },
    };
  });
}
```

- [ ] **Step 3: Update `addPurchaseOrderItem` and `removePurchaseOrderItem`**

```typescript
export async function addPurchaseOrderItem(purchaseOrderId: string, input: PurchaseOrderItemInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขใบสั่งซื้อ") };
  }

  const result = purchaseOrderItemSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, branchId } });
    if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
    if (order.status !== "pending") return { error: "แก้ไขใบสั่งซื้อที่รับของแล้วไม่ได้" };

    // ต้องมี unit_conversion ของ ingredient นี้ตรงกับ purchase_unit ที่เลือกไว้ก่อน
    // ไม่งั้นตอน Receive จะแปลงเป็น base_unit ไม่ได้ (DECISIONS.md D2)
    const conversion = await tx.unitConversion.findFirst({
      where: {
        ingredientId: result.data.ingredientId,
        purchaseUnitName: result.data.purchaseUnitName,
        ingredient: { branchId },
      },
    });
    if (!conversion) {
      return { error: "วัตถุดิบนี้ยังไม่มีหน่วยซื้อนี้ตั้งค่าไว้ — ไปตั้งค่าที่หน้าวัตถุดิบก่อน" };
    }

    const ingredient = await tx.ingredient.findFirstOrThrow({
      where: { id: result.data.ingredientId, branchId },
    });

    const item = await tx.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        ingredientId: result.data.ingredientId,
        purchaseUnitName: result.data.purchaseUnitName,
        quantity: result.data.quantity,
        unitPrice: result.data.unitPrice,
      },
    });

    return {
      success: true,
      item: {
        id: item.id,
        ingredientId: item.ingredientId,
        ingredientName: ingredient.name,
        purchaseUnitName: item.purchaseUnitName,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      },
    };
  });
}

export async function removePurchaseOrderItem(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขใบสั่งซื้อ") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const item = await tx.purchaseOrderItem.findFirst({
      where: { id, purchaseOrder: { branchId } },
      include: { purchaseOrder: true },
    });
    if (!item) return { error: "ไม่พบรายการ" };
    if (item.purchaseOrder.status !== "pending") {
      return { error: "แก้ไขใบสั่งซื้อที่รับของแล้วไม่ได้" };
    }

    await tx.purchaseOrderItem.delete({ where: { id } });
    return { success: true };
  });
}
```

- [ ] **Step 4: Update `receivePurchaseOrder` and `cancelPurchaseOrder`**

```typescript
// FR-PUR-03 / DECISIONS.md D1: Receive -> stock_in movement ต่อรายการ (ผูกกับ
// PurchaseOrderItem จริง) + recalculate cost_per_unit ด้วย WAC ทันที ทั้งหมดใน
// 1 atomic transaction ต่อ PO
export async function receivePurchaseOrder(purchaseOrderId: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์รับสินค้า") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, branchId },
      include: { items: true },
    });
    if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
    if (order.status !== "pending") return { error: "ใบสั่งซื้อนี้ถูกรับของหรือยกเลิกไปแล้ว" };
    if (order.items.length === 0) return { error: "ใบสั่งซื้อนี้ยังไม่มีรายการสินค้า" };

    for (const item of order.items) {
      const conversion = await tx.unitConversion.findFirst({
        where: { ingredientId: item.ingredientId, purchaseUnitName: item.purchaseUnitName },
      });
      if (!conversion) {
        throw new Error(
          `ไม่พบหน่วยแปลงของวัตถุดิบสำหรับหน่วยซื้อ "${item.purchaseUnitName}" — ไม่สามารถรับของได้`,
        );
      }

      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: item.ingredientId },
      });

      const receivedQtyBase = Number(item.quantity) * Number(conversion.conversionFactor);
      const receivedTotalCost = Number(item.quantity) * Number(item.unitPrice);
      const newCostPerUnit = computeWeightedAverageCost(
        Number(ingredient.currentStockQty),
        Number(ingredient.costPerUnit),
        receivedQtyBase,
        receivedTotalCost,
      );

      await tx.ingredient.update({
        where: { id: item.ingredientId },
        data: {
          currentStockQty: { increment: receivedQtyBase },
          costPerUnit: newCostPerUnit,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId: order.branchId,
          ingredientId: item.ingredientId,
          movementType: "stock_in",
          quantity: receivedQtyBase,
          referenceType: "purchase_order_item",
          referenceId: item.id,
          createdBy: actor.id,
        },
      });
    }

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "received", receivedAt: new Date(), updatedBy: actor.id },
    });

    return { success: true };
  });
}

export async function cancelPurchaseOrder(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id, branchId } });
    if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
    if (order.status !== "pending") return { error: "ยกเลิกได้เฉพาะใบสั่งซื้อที่ยังไม่ได้รับของ" };

    await tx.purchaseOrder.update({
      where: { id },
      data: { status: "cancelled", updatedBy: actor.id },
    });

    return { success: true };
  });
}
```

Note: `import { getOrCreateDefaultBranch }` is no longer needed in this file — remove it along with the top-of-file `import { prisma }`/`import { createClient }` if nothing else uses them, replacing with `import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";`. Keep the existing `import { computeWeightedAverageCost } from "@/lib/cost-cascade";` and the pagination imports from the earlier Task's `listPurchaseOrders` change unchanged.

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/purchases`
Expected: no errors, all tests pass

- [ ] **Step 6: Commit**

```bash
git add features/purchases/actions/purchase-orders.ts
git commit -m "feat: scope purchase-orders actions to organization/branch"
```

---

## Task 9: Convert `features/expense/actions/expense.ts`

**Files:**

- Modify: `features/expense/actions/expense.ts`

- [ ] **Step 1: Update `listExpenseCategories`, `listExpenseEntries`, `getExpenseCategoryTotals`**

```typescript
export async function listExpenseCategories() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { organizationId, branchId } = ctx;

  const categories = await withOrgScope(organizationId, (tx) =>
    tx.expenseCategory.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    }),
  );
  return { categories };
}

export async function listExpenseEntries(
  filters?: { categoryId?: string },
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการค่าใช้จ่าย") };
  }

  const where = {
    branchId,
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
  };

  return withOrgScope(organizationId, async (tx) => {
    const [entries, total] = await Promise.all([
      tx.expenseEntry.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: "desc" },
        skip: getSkip(page, pageSize),
        take: pageSize,
      }),
      tx.expenseEntry.count({ where }),
    ]);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        categoryName: e.category.name,
        amount: e.amount.toString(),
        description: e.description,
        hasSlip: e.slipUrl !== null,
        reversalOfId: e.reversalOfId,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: getTotalPages(total, pageSize),
    };
  });
}

export async function getExpenseCategoryTotals() {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการค่าใช้จ่าย") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const grouped = await tx.expenseEntry.groupBy({
      by: ["categoryId"],
      where: { branchId },
      _sum: { amount: true },
    });

    const categories = await tx.expenseCategory.findMany({
      where: { id: { in: grouped.map((g) => g.categoryId) }, branchId },
    });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    const totals = grouped
      .map((g) => ({
        categoryId: g.categoryId,
        categoryName: nameById.get(g.categoryId) ?? "—",
        net: Number(g._sum.amount ?? 0),
      }))
      .sort((a, b) => b.net - a.net);

    return {
      totals,
      grandTotal: totals.reduce((sum, t) => sum + t.net, 0),
    };
  });
}
```

- [ ] **Step 2: Update `createExpenseCategory`, `updateExpenseCategory`, `softDeleteExpenseCategory`**

```typescript
export async function createExpenseCategory(input: ExpenseCategoryInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มหมวดหมู่ค่าใช้จ่าย") };
  }

  const result = expenseCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const existingCategory = await tx.expenseCategory.findFirst({
      where: {
        branchId,
        deletedAt: null,
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

    const category = await tx.expenseCategory.create({
      data: { branchId, name: result.data.name, createdBy: actor.id },
    });

    return { success: true, category };
  });
}

// Only Owner has "update"/"delete" on the "expense" resource per the matrix
// (lib/permissions.ts) — Manager/Accountant may only create/view entries.
export async function updateExpenseCategory(id: string, input: ExpenseCategoryInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขหมวดหมู่ค่าใช้จ่าย") };
  }

  const result = expenseCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.expenseCategory.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบหมวดหมู่ค่าใช้จ่าย" };

    const existingCategory = await tx.expenseCategory.findFirst({
      where: {
        branchId,
        deletedAt: null,
        id: { not: id },
        name: { equals: result.data.name, mode: "insensitive" },
      },
    });
    if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

    await tx.expenseCategory.update({
      where: { id },
      data: { name: result.data.name, updatedBy: actor.id },
    });

    return { success: true };
  });
}

export async function softDeleteExpenseCategory(id: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "delete", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบหมวดหมู่ค่าใช้จ่าย") };
  }

  return withOrgScope(organizationId, async (tx) => {
    const current = await tx.expenseCategory.findFirst({ where: { id, branchId } });
    if (!current) return { error: "ไม่พบหมวดหมู่ค่าใช้จ่าย" };

    await tx.expenseCategory.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.id },
    });

    return { success: true };
  });
}
```

- [ ] **Step 3: Update `extractExpenseSlipData`, `createExpenseEntry`, `getExpenseSlipUrl`, `adjustExpenseEntry`**

```typescript
// อ่านจำนวนเงิน + รายละเอียดจากสลิปที่แนบ (ก่อนกดบันทึกจริง) เพื่อช่วยกรอกฟอร์ม
// ให้อัตโนมัติ — ไม่แตะฐานข้อมูล เลยไม่ต้อง withOrgScope
export async function extractExpenseSlipData(slipFile: File) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor } = ctx;

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ใช้งานฟีเจอร์นี้") };
  }

  return extractSlipData(slipFile);
}

// FR-EXP-02: Owner/Manager/Accountant สร้างได้ (DECISIONS.md D14)
export async function createExpenseEntry(input: ExpenseEntryInput & { slipFile?: File | null }) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์บันทึกค่าใช้จ่าย") };
  }

  const result = expenseEntrySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const category = await tx.expenseCategory.findFirst({
      where: { id: result.data.categoryId, branchId },
    });
    if (!category) return { error: "ไม่พบหมวดหมู่ค่าใช้จ่าย" };

    let slipUrl: string | null = null;
    if (input.slipFile && input.slipFile.size > 0) {
      const uploaded = await uploadExpenseSlip(input.slipFile, branchId);
      if (uploaded.error) return { error: uploaded.error };
      slipUrl = uploaded.path ?? null;
    }

    const entry = await tx.expenseEntry.create({
      data: {
        branchId,
        categoryId: result.data.categoryId,
        amount: result.data.amount,
        description: result.data.description || null,
        slipUrl,
        createdBy: actor.id,
      },
    });

    return { success: true, entryId: entry.id };
  });
}

// สร้าง signed URL ชั่วคราวสำหรับดูสลิปที่แนบไว้ — bucket เป็น private
export async function getExpenseSlipUrl(entryId: string) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสลิปนี้") };
  }

  const entry = await withOrgScope(organizationId, (tx) =>
    tx.expenseEntry.findFirst({ where: { id: entryId, branchId } }),
  );
  if (!entry?.slipUrl) return { error: "ไม่พบสลิปของรายการนี้" };

  const url = await getExpenseSlipSignedUrl(entry.slipUrl);
  if (!url) return { error: "สร้างลิงก์ดูสลิปไม่สำเร็จ" };

  return { url };
}

// FR-EXP-03: แก้ไข/ลบทำผ่านรายการปรับปรุงใหม่เท่านั้น ห้าม UPDATE/DELETE ของเดิม
// (ARCHITECTURE.md §4 Immutable Ledger)
export async function adjustExpenseEntry(input: ExpenseAdjustmentInput) {
  const ctx = await getActorWithOrg();
  if (!ctx) return { error: "กรุณาล็อกอินก่อน" };
  const { actor, organizationId, branchId } = ctx;

  try {
    requirePermission(actor.role, "update", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ปรับปรุงรายการค่าใช้จ่าย") };
  }

  const result = expenseAdjustmentSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  return withOrgScope(organizationId, async (tx) => {
    const original = await tx.expenseEntry.findFirst({
      where: { id: result.data.entryId, branchId },
    });
    if (!original) return { error: "ไม่พบรายการค่าใช้จ่ายนี้" };

    const adjustment = await tx.expenseEntry.create({
      data: {
        branchId,
        categoryId: original.categoryId,
        amount: result.data.delta,
        description: result.data.note || null,
        reversalOfId: original.id,
        createdBy: actor.id,
      },
    });

    return { success: true, entryId: adjustment.id };
  });
}
```

Keep the existing `import { uploadExpenseSlip, getExpenseSlipSignedUrl } from "@/lib/expense-slip-storage";` and `import { extractSlipData } from "@/lib/expense-slip-ocr";` unchanged — only the actor/scope pattern and the top-of-file `getActor`/`prisma`/`createClient` imports change (replace with `import { getActorWithOrg, withOrgScope } from "@/lib/tenant-scope";`).

- [ ] **Step 4: Type-check and test**

Run: `npx tsc --noEmit && npx vitest run features/expense`
Expected: no errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add features/expense/actions/expense.ts
git commit -m "feat: scope expense actions to organization/branch"
```

---

## Task 10: Update `app/expenses/page.tsx`, `app/purchases/page.tsx`, `app/inventory/page.tsx` for any changed action signatures

**Files:**

- Modify: `app/expenses/page.tsx`, `app/purchases/page.tsx`, `app/inventory/page.tsx` (only if Tasks 7-9 changed a function's parameter order/shape — they shouldn't have, since scoping was added internally without changing the public call signature, but verify)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in `app/`

- [ ] **Step 2: If there are errors, fix the call sites to match; if none, skip to commit**

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add app/expenses/page.tsx app/purchases/page.tsx app/inventory/page.tsx
git commit -m "fix: update page call sites for tenant-scoped action signatures"
```

---

## Task 11: Cross-organization isolation E2E test

**Files:**

- Create: `e2e/tenant-isolation.spec.ts`
- Modify: `e2e/helpers/test-users.ts` (add a helper to create a user in a specific, newly-created organization for test purposes)

**Interfaces:**

- Consumes: existing `e2e/helpers/login.ts`, `e2e/helpers/test-users.ts` patterns.

This is the test that actually proves the point of this whole plan — not that queries compile, but that one shop's staff can never see another's data through the running app.

- [ ] **Step 1: Add a org-scoped test-user helper**

In `e2e/helpers/test-users.ts`, add (following the file's existing patterns for `createTestUser`/`deleteTestUser` — read the current file first to match its exact style, imports, and the `prisma` client it already uses):

```typescript
// Creates a second Organization + Branch + owner User directly via Prisma —
// bypasses the (not-yet-built, Phase B) signup UI, since this Phase A test
// only needs two isolated tenants to exist, not to exercise how they're created.
export async function createTestOrgWithOwner(
  orgName: string,
  ownerEmail: string,
  password: string,
) {
  const org = await prisma.organization.create({ data: { name: orgName } });
  const branch = await prisma.branch.create({ data: { name: "สาขาหลัก", organizationId: org.id } });
  // ... create the Supabase Auth user + matching public.users row with
  // organizationId: org.id, role: "owner" — follow the exact pattern
  // createTestUser() in this same file already uses for auth user creation.
  return { org, branch };
}

export async function deleteTestOrg(orgId: string) {
  // Delete in FK-dependency order: business tables referencing branches of
  // this org, then branches, then users of this org, then the org itself.
  // Follow the cascade-deletion pattern deleteMenuChain()/deleteTestUser()
  // in this file already use for other FK chains.
}
```

- [ ] **Step 2: Write the isolation test**

```typescript
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { createTestOrgWithOwner, deleteTestOrg } from "./helpers/test-users";

test.describe("Multi-tenant data isolation", () => {
  test("org A's menu never appears for org B's staff, and vice versa", async ({ browser }) => {
    const uniqueSuffix = Date.now();
    const { org: orgA } = await createTestOrgWithOwner(
      `ร้าน A ${uniqueSuffix}`,
      `owner-a-${uniqueSuffix}@test.dsms.local`,
      "TestPass123!",
    );
    const { org: orgB } = await createTestOrgWithOwner(
      `ร้าน B ${uniqueSuffix}`,
      `owner-b-${uniqueSuffix}@test.dsms.local`,
      "TestPass123!",
    );

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAs(pageA, `owner-a-${uniqueSuffix}@test.dsms.local`, "TestPass123!");

    // Org A creates a menu category with a name unique enough to never collide
    await pageA.goto("/menus");
    await pageA.getByRole("button", { name: "เพิ่มหมวดหมู่" }).click();
    await pageA.getByLabel("ชื่อหมวดหมู่").fill(`เฉพาะร้าน A ${uniqueSuffix}`);
    await pageA.getByRole("button", { name: "บันทึก" }).click();
    await expect(pageA.getByText(`เฉพาะร้าน A ${uniqueSuffix}`)).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAs(pageB, `owner-b-${uniqueSuffix}@test.dsms.local`, "TestPass123!");

    await pageB.goto("/menus");
    await expect(pageB.getByText(`เฉพาะร้าน A ${uniqueSuffix}`)).not.toBeVisible();

    await contextA.close();
    await contextB.close();
    await deleteTestOrg(orgA.id);
    await deleteTestOrg(orgB.id);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx playwright test e2e/tenant-isolation.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/tenant-isolation.spec.ts e2e/helpers/test-users.ts
git commit -m "test: add cross-organization data isolation E2E test"
```

---

## Task 12: Full regression pass and production deployment

**Files:** none (verification-only task)

- [ ] **Step 1: Full local verification**

Run, in order:

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
npx playwright test
```

Expected: all pass, zero failures.

- [ ] **Step 2: Apply the migrations to production**

Using the production `DIRECT_URL` (session pooler, per `docs/DEPLOYMENT.md` — never the app's pooled `DATABASE_URL`):

```bash
DIRECT_URL="<production session pooler connection string>" npx prisma migrate deploy
```

- [ ] **Step 3: Verify production**

Log in as the existing owner (`pondkub1324@gmail.com`) on the live site and confirm the dashboard, menus, ingredients, inventory, purchase orders, and expenses pages all still show the exact same data as before this deploy — this is the "zero visible change" success criterion from the design spec's Phase A goal.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Follow-up (not part of this plan)

The following modules were **not** touched by this plan and still query without organization/branch scoping — a second plan must convert them before Phase B (self-service signup) can safely open the system to a second real tenant:

- `features/recipes/actions/recipes.ts`
- `features/pos/actions/checkout.ts`
- `features/pos/actions/void-refund.ts`
- `features/pos/actions/pos-menu.ts`
- `features/reports/actions/reports.ts`
- `features/dashboard/actions/dashboard.ts`
- `features/settings/actions/company-settings.ts` (also needs the `ReasonCode` scoping wired in, and the `TaxSettings`/`CompanySettings` singleton-lookup pattern updated to look up by `organizationId` instead of "the one row")
- `features/users/actions/manage-users.ts`
- `features/auth/actions/invite.ts`, `features/auth/actions/bootstrap.ts` (`bootstrap.ts` is retired entirely in Phase B, not converted)

Each follows the exact same conversion pattern demonstrated in Tasks 4-9 above.

### RLS is enabled but not yet load-bearing — do not switch `DATABASE_URL`'s role until every module above is converted

Task 2 enabled RLS and proved the policy SQL correct, but discovered the app's
actual `DATABASE_URL` role (`postgres`) has `BYPASSRLS = true` on Supabase Cloud,
and that attribute cannot be stripped from that role (`ALTER ROLE postgres
NOBYPASSRLS` → permission denied — a platform restriction). RLS is therefore
currently a defined-but-inert safety net: real enforcement requires switching
`DATABASE_URL` to a dedicated non-bypassing role (see Task 2's report for the
exact `CREATE ROLE ... NOBYPASSRLS` + `GRANT` statements already proven to work).

**This switch must not happen until every module — this plan's 7 (Tasks 4-9) AND
every module listed above — routes its queries through `withOrgScope()`
(`lib/tenant-scope.ts`, Task 3).** Any module still calling the raw `prisma`
singleton directly would silently return zero rows / fail every write the moment
the connection stops bypassing RLS, since nothing sets `app.current_org_id` for
it. Since the modules above are explicitly out of this plan's scope, the role
switch is also out of this plan's scope — it belongs as the final task of
whichever follow-up plan finishes converting them, after which `withOrgScope()`
truly covers every tenant-scoped query in the app and switching the role is safe.

Until then, RLS enabled-but-bypassed is the correct and intentional state — it
matches Phase A's "zero visible change" goal (Design Spec §8) exactly, and still
gives you a fully-proven-correct policy set ready to switch on the moment
coverage is complete, rather than nothing.
