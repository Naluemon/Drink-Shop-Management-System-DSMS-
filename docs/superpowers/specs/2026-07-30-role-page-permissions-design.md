# Role-Configurable Menu Permissions — Design

**Date**: 2026-07-30
**Status**: Draft, pending user review

## 1. Problem

Today the sidebar menu and the underlying access rules are two different hardcoded things that happen to agree:

- `components/nav-config.ts` computes, at module load, which roles see which nav items by deriving from the static CRUD matrix in `lib/permissions.ts` (`rolesWithAnyAccess`). A role with zero access to a resource never sees the link at all — it's removed from the list, not disabled.
- The owner cannot change any of this from the UI. Changing what a role can access means editing `lib/permissions.ts` and redeploying.
- Route-level protection is real but hand-written per page, and inconsistent in _how_ each page checks: `app/settings/page.tsx` does `if (profile.user.role !== "owner") redirect("/dashboard")`; `app/inventory/page.tsx` does `if (role === "cashier" || role === "accountant") redirect("/dashboard")`; `app/pos/page.tsx` does `if (role !== "shift_supervisor" && role !== "cashier") redirect("/dashboard")`; `app/dashboard/page.tsx` is the one page that calls the shared `hasPermission(...)` helper, and renders a welcome card instead of redirecting (redirecting dashboard → dashboard would loop). Every page redirects denied roles to `/dashboard` today, confirmed against `e2e/auth-rbac.spec.ts`'s six existing role-access cases — but each page spells out its own list of allowed/denied role names by hand instead of going through one shared check, so keeping 13 pages' hardcoded role lists in sync with each other (and with the sidebar) is exactly the kind of duplication that causes drift.

Goal (per user request, 2026-07-30): every role sees the _same_ sidebar menu, with items the role isn't allowed to use shown disabled rather than hidden; the shop owner can turn page access on or off per role from a settings screen, without a code change or redeploy.

## 2. Scope

**In scope**:

- A new page-level access control layer: can a given role open a given page at all. Owner-configurable, stored in the database, changeable at runtime.
- Uniform sidebar: all nav items always render for every role; items the current role can't access are visually disabled (greyed out, unclickable) instead of removed.
- One shared server-side gate that every page calls, replacing each page's own hand-written role-name check — same observable behavior (redirect denied roles to `/dashboard`, confirmed against `e2e/auth-rbac.spec.ts`), but driven by the new database table instead of a hardcoded role list copy-pasted per file.
- An owner-only settings screen: one checkbox grid (13 pages × 6 roles) to **restrict** page access, plus a "reset to default" action. **Revoke-only** (narrowed during final review — see §9): the seed values in §7 are the ceiling, so the owner can turn a role's page access off (and back on if the seed had it on), but can never grant a role a page beyond the seed.
- A change history (audit log) of who changed which role's access to which page, and when.
- Seed data at migration time that reproduces today's exact access behavior, so shipping this changes nothing until the owner deliberately edits it.

**Explicitly out of scope this round** (confirmed with user during brainstorming):

- Per-action (create/view/update/delete/approve/...) configurability. The existing CRUD matrix in `lib/permissions.ts` keeps governing what a role can _do_ once inside a page (e.g. whether Cashier sees a "create purchase order" button) — this design only controls whether the page opens at all.
- Changing the fixed list of 6 roles (`owner`, `manager`, `shift_supervisor`, `cashier`, `employee`, `accountant`). No custom roles.
- Any change to `/guide` — it has no data behind it and stays open to every role, as today.
- Any change to `/dashboard`'s access rule. It's the universal post-login landing page and the redirect target every other page's denial check sends a role to (§4) — an owner making it toggle-off-able would be able to strand a role with nowhere to land after login, or send a denied role's redirect into another denied page. It keeps its existing `hasPermission(role, "view", "dashboard")` check untouched: roles without dashboard "view" still land there and see the existing welcome card instead of KPI widgets, exactly as today. The sidebar's "แดชบอร์ด" item is always enabled for every role, same as "คู่มือการใช้งาน".
- File import/export and duplicate-detection (separate design, tracked as a follow-up sub-project).
- General data-entry speed/UX improvements (separate design, tracked as a follow-up sub-project).

## 3. Data model

```prisma
model RolePagePermission {
  id        String   @id @default(uuid())
  role      UserRole
  pageKey   String              // one of the 13 PageKey values, see §4
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

New `PageKey` union covering the 13 pages that currently appear in `NAV_GROUPS`, minus `/guide` and `/dashboard` (both excluded per §2 — universally accessible, not owner-toggleable):

```ts
export type PageKey =
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
// Plain query, no cache layer (matches getOrCreateCompanySettings() convention) — see below.
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

No caching layer is added — nothing else in this codebase caches a DB read (`getOrCreateCompanySettings()` queries fresh every call), and the table is small (≤ 90 rows), so `getRolePagePermissionMap` just queries `prisma.rolePagePermission.findMany()` directly each call, staying consistent with existing conventions.

**Every page** (`app/*/page.tsx`) adopts one shared gate, replacing its own hand-written role check:

```ts
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(profile.user.role, "settings", permMap)) {
  redirect("/dashboard");
}
```

This preserves the exact behavior `e2e/auth-rbac.spec.ts` already asserts (denied role → redirected to `/dashboard`) — the change is that the allow/deny decision now comes from one shared helper reading the database, instead of each page spelling out its own list of role names. `app/dashboard/page.tsx` keeps its existing `hasPermission(...)` + welcome-card special case (a page can't redirect to itself); everything else about that page is unchanged.

This does not touch `lib/permissions.ts` or any Server Action's `requirePermission()` calls — those remain the authority for create/update/delete/approve actions inside a page a role is allowed to open.

## 5. Sidebar changes

- `nav-config.ts`: `NAV_GROUPS` (currently a static const computed once at module load) becomes a function `getNavGroups(permMap: Record<PageKey, Set<UserRole>>)` that returns every group/item unconditionally, with a new `disabled: boolean` computed per item instead of filtering items out.
- `components/app-shell.tsx`: `AppShell` takes a new required prop `permMap`, passed down to `Sidebar`. `Sidebar` no longer does `.filter(...)`; it renders every item and applies disabled styling (`opacity-50`, `pointer-events-none`, no `<Link>` href) when `item.disabled` is true.
- Every `page.tsx` that renders `<AppShell>` must pass the same `permMap` it already fetched for its own access check (§4) — one DB read serves both the page's own gate and the sidebar's disabled state.

## 6. Owner-facing settings screen + audit history

New tab on the existing `/settings` page (owner-only, matching the page's existing owner-only gate): **"สิทธิ์การใช้งานตามตำแหน่ง"**.

- Grid: 13 rows (pages) × 6 columns (roles), checkboxes.
- The `owner` column is checked and disabled on every row — cannot be unchecked, matching §3/§4.
- Any (role, page) cell that is **not** allowed in the §7 seed is also rendered disabled (not hidden), with a hint that granting it needs a CRUD-matrix change first — the revoke-only rule from §2/§9. The Server Action rejects such a change independently, since a client is never trusted.
- **Save**: diffs the grid against the currently loaded permissions, upserts only the rows that changed into `RolePagePermission`, inserts one `PermissionChangeLog` row per changed cell, all inside one transaction, then `redirect`/revalidate the settings page (no cache-tag to invalidate — §4 reads the table directly on every call).
- **Reset to default**: restores every non-owner row to the seed values from §7 (also logged, one row per cell that actually changes).
- Below the grid, a **change history** table: newest first, columns "เมื่อไหร่ / ใคร / role ไหน / หน้าไหน / เปิด→ปิด หรือ ปิด→เปิด", 50 rows per page with simple "load more" pagination.

## 7. Seeding & rollout safety

- A one-time migration/seed script inserts a `RolePagePermission` row for every (non-owner role, pageKey) pair, with `allowed` computed from today's existing derivation (`rolesWithAnyAccess` logic per resource, as currently encoded in `nav-config.ts`). No `updatedBy`, no log rows written for these.
- Net effect: deploying this feature changes nothing about who can access what. Every role keeps exactly today's access until the owner opens the new settings tab and changes something.
- Forward-compatibility note (to be left as a code comment near `PageKey`): any future phase that adds a new page must add seed rows for it for every role at the same time it adds the nav item — a `pageKey` with no row for a role defaults to **denied** for that role (fail-safe-closed), not silently open.

## 8. Testing plan

- Unit: `canAccessPage` across all 6 roles × 13 `PageKey`s, including the owner-always-true case and the no-row-means-false case.
- Unit: settings-screen save action — writes only changed rows, writes exactly one log row per changed cell, writes zero rows when nothing changed.
- e2e (Playwright), one new scenario: owner disables "reports" for `accountant` (who has access today) → log in as accountant → sidebar shows "รายงาน" disabled/unclickable → direct navigation to `/reports` redirects to `/dashboard` (same assertion style as the existing six cases in `auth-rbac.spec.ts`).
- The existing six cases in `e2e/auth-rbac.spec.ts` must still pass unmodified after the migration seed (§7) — they're the regression guard proving the cutover changed no default behavior.

## 9. Relationship to existing RBAC decision log

`docs/DECISIONS.md` D14 flags any change touching authorization as a Hard-Stop item requiring direct user confirmation rather than a unilateral call. This design was produced through that process: every scoping decision below was confirmed interactively with the user before being written here, not assumed —

- Granularity is page-level only, not per-action (§2).
- `owner` is permanently locked to full access, enforced in code, not just hidden in the UI (§3, §4).
- ~~The owner can both grant access beyond today's defaults and restrict access below them, in either direction (§4, §6).~~ **Narrowed at final review to revoke-only**: the owner can restrict a role below the §7 seed defaults, and re-enable anything the seed had on, but can never grant beyond them. Reason: this design deliberately never touches the CRUD matrix in `lib/permissions.ts` (§2, §4), so most "granted" pages would still have their data fetch denied by `requirePermission()` and open only to error or bounce back to `/dashboard` — the ceiling is enforced server-side in `updateRolePagePermissions()` against `DEFAULT_ALLOWED_ROLES`, with the non-grantable checkboxes disabled (not hidden) in the grid to match.
- Disabled menu items are greyed out and unclickable, not hidden (§5).
- Every permission change is logged with who/what/when (§3, §6).

Implementation should add a new `DECISIONS.md` entry (D20 or next available number) recording this, the same way the multi-tenant design's RLS reversal plans to add one for D7 — exact numbering decided at implementation time.
