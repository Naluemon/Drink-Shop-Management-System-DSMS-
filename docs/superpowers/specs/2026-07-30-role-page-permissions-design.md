# Role-Configurable Menu Permissions — Design

**Date**: 2026-07-30
**Status**: Draft, pending user review

## 1. Problem

Today the sidebar menu and the underlying access rules are two different hardcoded things that happen to agree:

- `components/nav-config.ts` computes, at module load, which roles see which nav items by deriving from the static CRUD matrix in `lib/permissions.ts` (`rolesWithAnyAccess`). A role with zero access to a resource never sees the link at all — it's removed from the list, not disabled.
- The owner cannot change any of this from the UI. Changing what a role can access means editing `lib/permissions.ts` and redeploying.
- Route-level protection is inconsistent between pages: `app/settings/page.tsx` does an inline `if (profile.user.role !== "owner") redirect(...)`; `app/dashboard/page.tsx` checks `hasPermission(...)` and renders a friendly "welcome" card for roles without dashboard access; every other page (`ingredients`, `recipes`, `inventory`, `purchases`, `reports`, `users`, ...) has **no page-level check at all** — access is enforced only by the nav being hidden, plus whatever the page's data-loading Server Actions do internally via `requirePermission()`, which throws an unhandled `PermissionError` if a role without access hits the route directly by URL.

Goal (per user request, 2026-07-30): every role sees the _same_ sidebar menu, with items the role isn't allowed to use shown disabled rather than hidden; the shop owner can turn page access on or off per role from a settings screen, without a code change or redeploy.

## 2. Scope

**In scope**:

- A new page-level access control layer: can a given role open a given page at all. Owner-configurable, stored in the database, changeable at runtime.
- Uniform sidebar: all nav items always render for every role; items the current role can't access are visually disabled (greyed out, unclickable) instead of removed.
- A consistent "you don't have access to this page" screen used by every page, replacing the three different (or absent) patterns that exist today.
- An owner-only settings screen: one checkbox grid (14 pages × 6 roles) to grant/restrict page access, plus a "reset to default" action.
- A change history (audit log) of who changed which role's access to which page, and when.
- Seed data at migration time that reproduces today's exact access behavior, so shipping this changes nothing until the owner deliberately edits it.

**Explicitly out of scope this round** (confirmed with user during brainstorming):

- Per-action (create/view/update/delete/approve/...) configurability. The existing CRUD matrix in `lib/permissions.ts` keeps governing what a role can _do_ once inside a page (e.g. whether Cashier sees a "create purchase order" button) — this design only controls whether the page opens at all.
- Changing the fixed list of 6 roles (`owner`, `manager`, `shift_supervisor`, `cashier`, `employee`, `accountant`). No custom roles.
- Any change to `/guide` — it has no data behind it and stays open to every role, as today.
- File import/export and duplicate-detection (separate design, tracked as a follow-up sub-project).
- General data-entry speed/UX improvements (separate design, tracked as a follow-up sub-project).

## 3. Data model

```prisma
model RolePagePermission {
  id        String   @id @default(uuid())
  role      UserRole
  pageKey   String              // one of the 14 PageKey values, see §4
  allowed   Boolean
  updatedAt DateTime @updatedAt
  updatedBy String?             // User.id of the owner who last changed this row; null = untouched since seed

  @@unique([role, pageKey])
  @@map("role_page_permissions")
}

model PermissionChangeLog {
  id        String   @id @default(uuid())
  role      UserRole
  pageKey   String
  allowed   Boolean            // the new value after the change
  changedBy String             // User.id of the owner who made the change
  changedAt DateTime @default(now())

  @@map("permission_change_logs")
}
```

- `owner` never gets a row in `RolePagePermission`. The access check (§4) special-cases `role === "owner"` to always return `true`, independent of the table — this is the enforcement mechanism behind "owner can never be locked out," not just a UI convenience.
- `PermissionChangeLog` is append-only and only written on real edits made through the settings screen — the initial seed (§6) does not write log rows.
- Single-tenant scope: DSMS has no organization/shop boundary yet (confirmed against `prisma/schema.prisma` — `CompanySettings` is an explicit MVP singleton), so these tables are global, not scoped per branch or org. If the multi-tenant conversion (`2026-07-26-multi-tenant-conversion-design.md`) lands first, both tables will need an `organizationId` column added the same way that design adds it elsewhere.

## 4. Central access-control helper

New `PageKey` union covering the 14 pages that currently appear in `NAV_GROUPS` minus `/guide`:

```ts
export type PageKey =
  | "dashboard"
  | "pos"
  | "refunds"
  | "ingredients"
  | "recipes"
  | "menus"
  | "modifier-groups"
  | "inventory"
  | "suppliers"
  | "purchases"
  | "expenses"
  | "reports"
  | "users"
  | "settings";
```

New `lib/page-access.ts`:

```ts
// Cached read of the whole table, revalidated by tag when the owner saves changes —
// this table changes rarely, so a full-table cache avoids a DB round trip on every request.
export async function getRolePagePermissionMap(): Promise<Record<PageKey, Set<UserRole>>>;

export function canAccessPage(
  role: UserRole,
  pageKey: PageKey,
  map: Record<PageKey, Set<UserRole>>,
): boolean {
  if (role === "owner") return true;
  return map[pageKey]?.has(role) ?? false; // no row = deny, fail-safe
}
```

`getRolePagePermissionMap` uses `unstable_cache` keyed on `["role-page-permissions"]` with tag `"role-page-permissions"`; the settings-screen save action calls `revalidateTag("role-page-permissions")` after writing.

**Every page** (`app/*/page.tsx`) adopts one shared pattern, replacing whatever it does today:

```ts
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(profile.user.role, "settings", permMap)) {
  return (
    <AppShell user={profile.user} logoutAction={logout}>
      <NoPermissionCard />
    </AppShell>
  );
}
```

`NoPermissionCard` is a new shared component (`components/no-permission-card.tsx`), generalizing the card `app/dashboard/page.tsx` already renders for roles without dashboard access, so all 14 pages show the identical message instead of three different behaviors (silent redirect, custom card, unhandled crash).

This does not touch `lib/permissions.ts` or any Server Action's `requirePermission()` calls — those remain the authority for create/update/delete/approve actions inside a page a role is allowed to open.

## 5. Sidebar changes

- `nav-config.ts`: `NAV_GROUPS` (currently a static const computed once at module load) becomes a function `getNavGroups(permMap: Record<PageKey, Set<UserRole>>)` that returns every group/item unconditionally, with a new `disabled: boolean` computed per item instead of filtering items out.
- `components/app-shell.tsx`: `AppShell` takes a new required prop `permMap`, passed down to `Sidebar`. `Sidebar` no longer does `.filter(...)`; it renders every item and applies disabled styling (`opacity-50`, `pointer-events-none`, no `<Link>` href) when `item.disabled` is true.
- Every `page.tsx` that renders `<AppShell>` must pass the same `permMap` it already fetched for its own access check (§4) — one DB read serves both the page's own gate and the sidebar's disabled state.

## 6. Owner-facing settings screen + audit history

New tab on the existing `/settings` page (owner-only, matching the page's existing owner-only gate): **"สิทธิ์การใช้งานตามตำแหน่ง"**.

- Grid: 14 rows (pages) × 6 columns (roles), checkboxes.
- The `owner` column is checked and disabled on every row — cannot be unchecked, matching §3/§4.
- **Save**: diffs the grid against the currently loaded permissions, upserts only the rows that changed into `RolePagePermission`, inserts one `PermissionChangeLog` row per changed cell, all inside one transaction, then `revalidateTag("role-page-permissions")`.
- **Reset to default**: restores every non-owner row to the seed values from §7 (also logged, one row per cell that actually changes).
- Below the grid, a **change history** table: newest first, columns "เมื่อไหร่ / ใคร / role ไหน / หน้าไหน / เปิด→ปิด หรือ ปิด→เปิด", 50 rows per page with simple "load more" pagination.

## 7. Seeding & rollout safety

- A one-time migration/seed script inserts a `RolePagePermission` row for every (non-owner role, pageKey) pair, with `allowed` computed from today's existing derivation (`rolesWithAnyAccess` logic per resource, as currently encoded in `nav-config.ts`). No `updatedBy`, no log rows written for these.
- Net effect: deploying this feature changes nothing about who can access what. Every role keeps exactly today's access until the owner opens the new settings tab and changes something.
- Forward-compatibility note (to be left as a code comment near `PageKey`): any future phase that adds a new page must add seed rows for it for every role at the same time it adds the nav item — a `pageKey` with no row for a role defaults to **denied** for that role (fail-safe-closed), not silently open.

## 8. Testing plan

- Unit: `canAccessPage` across all 6 roles × 14 `PageKey`s, including the owner-always-true case and the no-row-means-false case.
- Unit: settings-screen save action — writes only changed rows, writes exactly one log row per changed cell, writes zero rows when nothing changed.
- e2e (Playwright), one scenario: owner disables "reports" for `cashier` → log in as cashier → sidebar shows "รายงาน" disabled/unclickable → direct navigation to `/reports` renders `NoPermissionCard` instead of report data or a crash.

## 9. Relationship to existing RBAC decision log

`docs/DECISIONS.md` D14 flags any change touching authorization as a Hard-Stop item requiring direct user confirmation rather than a unilateral call. This design was produced through that process: every scoping decision below was confirmed interactively with the user before being written here, not assumed —

- Granularity is page-level only, not per-action (§2).
- `owner` is permanently locked to full access, enforced in code, not just hidden in the UI (§3, §4).
- The owner can both grant access beyond today's defaults and restrict access below them, in either direction (§4, §6).
- Disabled menu items are greyed out and unclickable, not hidden (§5).
- Every permission change is logged with who/what/when (§3, §6).

Implementation should add a new `DECISIONS.md` entry (D20 or next available number) recording this, the same way the multi-tenant design's RLS reversal plans to add one for D7 — exact numbering decided at implementation time.
