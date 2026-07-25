# Multi-Tenant SaaS Conversion — Design

**Date**: 2026-07-26
**Status**: Draft, pending user review

## 1. Problem

DSMS is currently single-tenant by construction, not by accident:

- `User` has no shop/organization column at all — every user in the database is treated as staff of "the one shop."
- `CompanySettings` and `TaxSettings` are singleton tables (exactly one row is expected system-wide).
- `features/auth/actions/bootstrap.ts` enforces "exactly one `owner` role, ever, system-wide" (`DECISIONS.md` D6) — the first person to sign up becomes the permanent sole owner; everyone after that must be invited by them.
- `Branch` exists in the schema and 18 business tables (`Ingredient`, `Menu`, `SalesTransaction`, ...) already carry a `branch_id` column, but `Branch` was designed for a future "one shop, multiple physical locations" feature, not as a boundary between different shops' data. It has no owner and nothing scopes read queries by it.
- Confirmed by grep: `getOrCreateDefaultBranch()` (`lib/default-branch.ts`) is called only at **create** time, to stamp new rows. Every **list/read** action (`listIngredients`, `listSuppliers`, `listPurchaseOrders`, dashboard aggregates, reports, POS menu, ...) queries with no branch filter at all today. There is currently a single implicit branch for the whole system and every read returns everything in it.

Goal: let independent shops sign up and use DSMS as a shared, hosted product — each shop's users, menus, sales, and settings fully isolated from every other shop's — without deploying a separate Supabase project + Vercel instance per shop.

## 2. Scope

**In scope**:

- New `Organization` model as the tenant boundary, sitting above `Branch`.
- Schema changes to attach every table that currently has no shop scoping (`User`, `UserInvite`, `CompanySettings`, `TaxSettings`, `Branch`) to an `Organization`.
- Query-layer tenant scoping added to every read/write path across the ~13 `features/*/actions/*.ts` files that currently query without a branch/org filter.
- Defense-in-depth via Postgres Row-Level Security (RLS), reversing `DECISIONS.md` D7's earlier single-tenant "RBAC alone is enough" call — D7 gets superseded with a new decision entry, not silently ignored.
- Self-service signup flow: one form (shop name + owner email + password) creates an `Organization`, a default `Branch`, and an `owner` `User` in one transaction.
- Migration of the existing production data (the current shop, owned by `pondkub1324@gmail.com`) into "Organization #1" automatically, with zero data loss and zero disruption to that shop's continued use.

**Explicitly out of scope this round** (confirmed with user):

- Billing/subscriptions — no payment collection, no plan limits. Every signed-up org gets full access.
- Custom subdomains or per-shop URLs (e.g. `shopname.dsms.app`) — every shop uses the same shared URL and signs in through the same login/signup pages.
- One user belonging to multiple organizations (franchise/multi-brand owner use case).
- Org-level branding/theming beyond what `CompanySettings` already exposes (receipt footer, name, logo-equivalent fields).

## 3. Data model changes

New model:

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("organizations")
}
```

Changed models — add a required `organizationId` FK to each:

- `Branch.organizationId` — every branch belongs to exactly one org.
- `User.organizationId` — every user belongs to exactly one org (matches the existing invite-only model: a user already only ever belongs to "the one shop," this just makes that explicit and per-org instead of system-wide).
- `UserInvite.organizationId` — invites are scoped to the org that sent them; accepting one creates a `User` in that same org.
- `CompanySettings.organizationId` (unique) — was a singleton row; becomes one row per org.
- `TaxSettings.organizationId` (unique) — same.
- `ReasonCode.organizationId` — found during planning: unlike the other business tables, `ReasonCode` has no `branch_id` at all today. It's a system-wide singleton list (like `CompanySettings`), not something that inherits scope through `Branch`, so it needs the same direct treatment.

**No schema change needed** for the 11 business tables that already carry `branch_id` directly (`Supplier`, `Ingredient`, `Recipe`, `MenuCategory`, `Menu`, `ModifierGroup`, `PurchaseOrder`, `InventoryMovement`, `SalesTransaction`, `ExpenseCategory`, `ExpenseEntry`), nor for the 9 child tables that inherit scope by joining to one of those (`UnitConversion`, `RecipeIngredient`, `MenuVariant`, `Modifier`, `PurchaseOrderItem`, `MenuModifierGroup`, `SalesTransactionItem`, `SalesTransactionItemModifier`, `RefundRequest`) — they inherit organization scope transitively once `Branch.organizationId` exists, because every one of them already points (directly or via a parent) at a `Branch`. This is the main reason the schema-migration surface is smaller than "add org_id to every table."

## 4. Isolation enforcement — two layers

### Layer 1: Application code

Every action file currently has its own copy-pasted `getActor()` helper that resolves the logged-in Supabase user to a Prisma `User` row. This gets consolidated into one shared helper (`lib/tenant-scope.ts`) that also resolves and returns `organizationId` and the caller's `branchId`.

Every Prisma query in `features/*/actions/*.ts` that reads, counts, updates, or deletes a branch-scoped or org-scoped row must filter by that resolved scope. This is the bulk of the mechanical work: touching every `findMany`, `findFirst`, `count`, `update`, and `delete` call across all ~13 action files (`ingredients.ts`, `suppliers.ts`, `menus.ts`, `modifier-groups.ts`, `recipes.ts`, `inventory.ts`, `purchase-orders.ts`, `expense.ts`, `checkout.ts`, `void-refund.ts`, `pos-menu.ts`, `reports.ts`, `dashboard.ts`, `company-settings.ts`, `manage-users.ts`, `invite.ts`).

### Layer 2: Database (Postgres Row-Level Security)

App-layer filtering alone repeats the exact risk D7 already flagged for a different reason: one missed `where` clause and org A's data leaks to org B — except now that's a real cross-customer data breach, not a hypothetical. RLS adds a backstop that holds even if a query is written wrong.

Mechanics: Prisma's driver-adapter connection (`@prisma/adapter-pg`) is a single elevated-privilege connection pool, not a per-user connection — this is exactly why D7 rejected RLS for the single-tenant case (RLS policies would have nothing to check against). To make RLS meaningful now:

1. Enable RLS on every org/branch-scoped table, with a policy such as `branch_id IN (SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id')::uuid)`.
2. Every request wraps its Prisma calls in a transaction that first runs `SET LOCAL app.current_org_id = '<resolved org id>'`, scoped to that transaction only (Postgres resets `SET LOCAL` at transaction end, so this can't leak between requests sharing a pooled connection).
3. This requires a shared transaction-wrapping helper (extends the Layer 1 `lib/actor.ts` helper) that every action calls through, rather than using the raw `prisma` client directly.

This reverses `DECISIONS.md` D7's conclusion for the multi-tenant world. D7 is not deleted — a new decision entry (D19 or similar, exact numbering decided at write time) records why the original single-tenant reasoning no longer applies now that unrelated customers share one database.

## 5. Auth flow changes

- **New**: `/signup` — shop name + owner email + password. Creates `Organization`, default `Branch` ("สาขาหลัก"), and `User` (`role: owner`) inside one transaction. Replaces `bootstrapOwner()`'s "only the first-ever signup in the whole system becomes owner" rule (`DECISIONS.md` D6) with "every signup creates a new org and becomes that org's owner." D6 gets updated to reflect this, not silently reinterpreted.
- **Retired**: `/setup` and `checkBootstrapStatus()` (`features/auth/actions/bootstrap.ts`) — the "is there a system-wide owner yet" check no longer makes sense once multiple orgs each have their own owner.
- **Unchanged**: the invite flow (`features/auth/actions/invite.ts`) — conceptually identical, just scoped: an invite carries the inviter's `organizationId`, and accepting one creates the new `User` in that same org instead of "the" org.
- **Unchanged**: the RBAC role matrix (`lib/permissions.ts`) — owner/manager/shift_supervisor/cashier/employee/accountant keep the exact same permissions; they're now just evaluated per-org instead of system-wide.

## 6. Migration of existing production data

One Prisma migration, run once against production:

1. Create `Organization` row ("ร้านของคุณ" — placeholder name, renameable in Settings afterward).
2. Backfill `organization_id` on every existing `Branch`, `User`, `UserInvite`, `CompanySettings`, `TaxSettings` row to point at it.
3. Make the new `organization_id` columns `NOT NULL` after backfill.

Zero data loss. The current owner (`pondkub1324@gmail.com`) and all existing menus/ingredients/suppliers/sales continue working exactly as before, now living inside "Organization #1."

## 7. Testing

- Unit tests (`vitest` + `vitest-mock-extended`'s `mockDeep<PrismaClient>()`): every action file's existing tests need their mocked `prisma.user.findUnique` (actor resolution) updated to include `organizationId`; new tests assert that a query includes the expected `branchId`/`organizationId` filter, and that cross-org access attempts are rejected.
- New E2E test (`e2e/`): two organizations signed up independently, each creates a menu item with the same name — verify org A's dashboard/menu list never shows org B's item, and vice versa. This is the test that actually proves isolation, not just that queries compile.
- RLS policies get their own direct-SQL test (bypassing the app layer entirely) confirming that even a raw query without an app-layer filter cannot cross the org boundary — this is what justifies calling it "defense in depth" rather than decoration.

## 8. Phasing

This is too large to land as one change. Two sequential phases, each independently shippable:

**Phase A — Data isolation (must land first, no user-visible change)**
Organization model, backfill migration, app-layer query scoping across all action files, RLS policies + session-variable wiring, full test coverage above. At the end of Phase A the system still only has one org (the existing shop) and looks identical to users — this phase is purely about proving the isolation mechanism is correct before anyone new can sign up into it.

**Phase B — Self-service signup**
New `/signup` page and flow, retiring `/setup`/bootstrap, updating the guide (`features/guide/components/guide-content.tsx`) and `docs/DECISIONS.md` D6. Only starts once Phase A is merged, tested, and deployed — there is no reason to open signups to strangers before the isolation guarantee underneath them is verified.

## 9. Open items for the implementation plan (not blocking design approval)

- Exact new `DECISIONS.md` entry numbers for the D6 update and the D7-superseding entry.
- Whether `Branch` selection needs any UI at all yet (today `getOrCreateDefaultBranch` silently picks "the one branch" — Phase A can keep that per-org: "the one branch of this org" — multi-branch-per-org UI is a separate future feature, not part of this conversion).
