# Role-Configurable Menu Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the shop owner grant or restrict, per role, which of the app's 13 gated pages that role can open — from a Settings screen, at runtime, with a change history — instead of the current hardcoded per-page role checks.

**Architecture:** One new DB table (`RolePagePermission`) is the single source of truth for "can role X open page Y," read through a shared `lib/page-access.ts` helper. Every page's existing hand-written role check is replaced with a call to that helper (identical observable behavior — redirect to `/dashboard` on denial). The sidebar renders every nav item always, disabling (not hiding) the ones the current role can't reach. An owner-only grid on `/settings` edits the table and writes to an append-only `PermissionChangeLog`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Zod, Vitest + `vitest-mock-extended`, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-30-role-page-permissions-design.md`

## Global Constraints

- Owner is always allowed everywhere — enforced in code (`canAccessPage` special-cases `role === "owner"`), never just hidden in the UI. Never remove this check.
- `/dashboard` and `/guide` are never gated by this system — both stay always-enabled in the sidebar and keep their current access logic untouched.
- This only controls whether a role can open a page at all. It never touches `lib/permissions.ts`'s CRUD matrix — every `requirePermission()` call inside a page's Server Actions stays exactly as it is.
- A `(role, pageKey)` pair with no row in `RolePagePermission` means **denied** (fail-safe-closed) — never treat a missing row as allowed.
- Deploying this must not change any role's current access. The migration seeds exactly today's behavior (§ Task 1).
- The six existing cases in `e2e/auth-rbac.spec.ts` must keep passing, unmodified, after every task in this plan.
- DB columns are snake_case, Prisma fields are camelCase mapped with `@map()` — follow the pattern already used by every other model in `prisma/schema.prisma`.
- No new caching layer (no `unstable_cache`/`revalidateTag`) — this codebase doesn't cache DB reads anywhere (see `lib/settings.ts`), and this table is small enough that a plain query per request is fine.

---

## Task 1: Schema — `RolePagePermission` + `PermissionChangeLog`

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_role_page_permissions/migration.sql` (generated, then hand-edited)

**Interfaces:**

- Produces: Prisma models `RolePagePermission` (`role: UserRole`, `pageKey: string`, `allowed: boolean`, `updatedAt`, `updatedBy: string | null`) and `PermissionChangeLog` (`role`, `pageKey`, `allowed`, `changedBy: string`, `changedAt`). Compound unique `role_pageKey` on `RolePagePermission` (Prisma's default name for `@@unique([role, pageKey])`, used as `prisma.rolePagePermission.upsert({ where: { role_pageKey: { role, pageKey } }, ... })` in Task 3).

- [ ] **Step 1: Add the two models to `prisma/schema.prisma`**

Add this block after the `PermissionError`/RBAC comment block near the other Phase-2 models (find `model UserInvite` and insert after it):

```prisma
// Owner-configurable "can this role open this page at all" table — replaces
// the hardcoded per-page role checks in app/*/page.tsx (see
// docs/superpowers/specs/2026-07-30-role-page-permissions-design.md).
// `owner` intentionally never gets a row here — lib/page-access.ts's
// canAccessPage() hardcodes owner to always pass, independent of this table.
model RolePagePermission {
  id        String   @id @default(uuid())
  role      UserRole
  pageKey   String   @map("page_key")
  allowed   Boolean
  updatedAt DateTime @updatedAt @map("updated_at")
  updatedBy String?  @map("updated_by") // null = untouched since the deploy-time seed

  @@unique([role, pageKey])
  @@map("role_page_permissions")
}

/// Append-only audit trail for RolePagePermission edits made through the
/// Settings screen. Never updated or deleted, only inserted.
model PermissionChangeLog {
  id        String   @id @default(uuid())
  role      UserRole
  pageKey   String   @map("page_key")
  allowed   Boolean
  changedBy String   @map("changed_by")
  changedAt DateTime @default(now()) @map("changed_at")

  @@map("permission_change_logs")
}
```

- [ ] **Step 2: Create the migration without applying it yet**

Run:

```bash
npx prisma migrate dev --create-only --name add_role_page_permissions
```

This writes `prisma/migrations/<timestamp>_add_role_page_permissions/migration.sql` with the `CREATE TABLE`/`CREATE UNIQUE INDEX` statements but does not touch the dev database yet — this lets us hand-append seed data before it's applied.

- [ ] **Step 3: Append the default-access seed data to the generated migration.sql**

Open the migration file Step 2 created and add this block at the end (after Prisma's generated `CREATE TABLE`/`CREATE UNIQUE INDEX` statements). These 30 rows reproduce exactly today's access, derived from each page's current hand-written role check (see the spec's §7) — every `(role, pageKey)` combination not listed here is intentionally absent, meaning denied by default:

```sql
-- Seed: reproduce today's exact default page access (see
-- docs/superpowers/specs/2026-07-30-role-page-permissions-design.md §7).
-- Only ALLOWED pairs get a row — an absent (role, page_key) pair means
-- denied (fail-safe-closed). updated_at has no real prior edit, so it's
-- just set to the seed time; updated_by stays NULL ("untouched since seed").
INSERT INTO "role_page_permissions" ("id", "role", "page_key", "allowed", "updated_at") VALUES
  ('seed-role-page-perm-01', 'shift_supervisor', 'pos', true, now()),
  ('seed-role-page-perm-02', 'cashier', 'pos', true, now()),
  ('seed-role-page-perm-03', 'manager', 'refunds', true, now()),
  ('seed-role-page-perm-04', 'shift_supervisor', 'refunds', true, now()),
  ('seed-role-page-perm-05', 'manager', 'ingredients', true, now()),
  ('seed-role-page-perm-06', 'shift_supervisor', 'ingredients', true, now()),
  ('seed-role-page-perm-07', 'cashier', 'ingredients', true, now()),
  ('seed-role-page-perm-08', 'employee', 'ingredients', true, now()),
  ('seed-role-page-perm-09', 'manager', 'recipes', true, now()),
  ('seed-role-page-perm-10', 'shift_supervisor', 'recipes', true, now()),
  ('seed-role-page-perm-11', 'cashier', 'recipes', true, now()),
  ('seed-role-page-perm-12', 'manager', 'menus', true, now()),
  ('seed-role-page-perm-13', 'shift_supervisor', 'menus', true, now()),
  ('seed-role-page-perm-14', 'cashier', 'menus', true, now()),
  ('seed-role-page-perm-15', 'manager', 'modifier-groups', true, now()),
  ('seed-role-page-perm-16', 'shift_supervisor', 'modifier-groups', true, now()),
  ('seed-role-page-perm-17', 'cashier', 'modifier-groups', true, now()),
  ('seed-role-page-perm-18', 'manager', 'inventory', true, now()),
  ('seed-role-page-perm-19', 'shift_supervisor', 'inventory', true, now()),
  ('seed-role-page-perm-20', 'employee', 'inventory', true, now()),
  ('seed-role-page-perm-21', 'manager', 'suppliers', true, now()),
  ('seed-role-page-perm-22', 'shift_supervisor', 'suppliers', true, now()),
  ('seed-role-page-perm-23', 'manager', 'purchases', true, now()),
  ('seed-role-page-perm-24', 'shift_supervisor', 'purchases', true, now()),
  ('seed-role-page-perm-25', 'manager', 'expenses', true, now()),
  ('seed-role-page-perm-26', 'accountant', 'expenses', true, now()),
  ('seed-role-page-perm-27', 'manager', 'reports', true, now()),
  ('seed-role-page-perm-28', 'shift_supervisor', 'reports', true, now()),
  ('seed-role-page-perm-29', 'accountant', 'reports', true, now()),
  ('seed-role-page-perm-30', 'manager', 'users', true, now());
```

(`settings` has zero seeded rows — today only `owner` can reach it, and owner never gets a row.)

- [ ] **Step 4: Apply the migration**

Run:

```bash
npx prisma migrate dev
```

Expected: output ends with `Your database is now in sync with your schema.` and no errors — this proves all 30 `INSERT`s ran without a constraint violation (duplicate `(role, page_key)` pairs would fail the unique index). This also regenerates the Prisma client (`prisma generate` runs automatically), so `prisma.rolePagePermission` / `prisma.permissionChangeLog` become available.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/"
git commit -m "feat: add RolePagePermission + PermissionChangeLog tables"
```

---

## Task 2: `lib/page-access.ts` — central access-control helper

**Files:**

- Create: `lib/page-access.ts`
- Test: `lib/page-access.test.ts`

**Interfaces:**

- Consumes: `prisma` from `@/lib/prisma`; `UserRole` from `@/lib/generated/prisma/enums`.
- Produces: `PAGE_KEYS` (readonly tuple of 13 strings), `PageKey` (union type), `NON_OWNER_ROLES` (readonly tuple of 5 `UserRole`s), `RolePagePermissionMap` (`Record<PageKey, Set<UserRole>>`), `DEFAULT_ALLOWED_ROLES` (`Record<PageKey, UserRole[]>`), `getRolePagePermissionMap(): Promise<RolePagePermissionMap>`, `canAccessPage(role, pageKey, map): boolean`, `buildDefaultPermissionChanges(): { role: UserRole; pageKey: PageKey; allowed: boolean }[]`. These are consumed by Task 3 (`components/nav-config.ts`), Task 4 (every `app/*/page.tsx`), and Task 5 (`features/settings/actions/role-page-permissions.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/page-access.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

import { prisma } from "@/lib/prisma";
import {
  PAGE_KEYS,
  canAccessPage,
  getRolePagePermissionMap,
  buildDefaultPermissionChanges,
  type RolePagePermissionMap,
} from "./page-access";
import type { UserRole } from "@/lib/generated/prisma/enums";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
});

function emptyMap(): RolePagePermissionMap {
  return Object.fromEntries(
    PAGE_KEYS.map((k) => [k, new Set<UserRole>()]),
  ) as RolePagePermissionMap;
}

describe("canAccessPage", () => {
  it("always allows owner, even with an empty map", () => {
    const map = emptyMap();
    for (const pageKey of PAGE_KEYS) {
      expect(canAccessPage("owner", pageKey, map)).toBe(true);
    }
  });

  it("denies a non-owner role when the map has no entry for that page", () => {
    expect(canAccessPage("cashier", "settings", emptyMap())).toBe(false);
  });

  it("allows a non-owner role explicitly present in the map, and no one else", () => {
    const map = emptyMap();
    map.pos.add("cashier");
    expect(canAccessPage("cashier", "pos", map)).toBe(true);
    expect(canAccessPage("manager", "pos", map)).toBe(false);
  });
});

describe("getRolePagePermissionMap", () => {
  it("builds a map from allowed=true rows only, grouped by pageKey", async () => {
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
      {
        id: "2",
        role: "manager",
        pageKey: "reports",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);

    const map = await getRolePagePermissionMap();

    expect(map.pos.has("cashier")).toBe(true);
    expect(map.pos.has("manager")).toBe(false);
    expect(map.reports.has("manager")).toBe(true);
    expect(prismaMock.rolePagePermission.findMany).toHaveBeenCalledWith({
      where: { allowed: true },
    });
  });
});

describe("buildDefaultPermissionChanges", () => {
  it("covers every (non-owner role, pageKey) pair exactly once", () => {
    const changes = buildDefaultPermissionChanges();
    expect(changes).toHaveLength(5 * PAGE_KEYS.length);
  });

  it("matches today's default: cashier can reach pos but not settings", () => {
    const changes = buildDefaultPermissionChanges();
    const cashierPos = changes.find((c) => c.role === "cashier" && c.pageKey === "pos");
    const cashierSettings = changes.find((c) => c.role === "cashier" && c.pageKey === "settings");
    expect(cashierPos?.allowed).toBe(true);
    expect(cashierSettings?.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/page-access.test.ts`
Expected: FAIL — `Cannot find module './page-access'` (the file doesn't exist yet).

- [ ] **Step 3: Write `lib/page-access.ts`**

```ts
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";

// The 13 pages this table gates. /dashboard and /guide are deliberately
// excluded — see docs/superpowers/specs/2026-07-30-role-page-permissions-design.md §2:
// dashboard is the universal post-login landing page and the redirect target
// every page below sends a denied role to, so it can never be turned off;
// guide has no data behind it and stays open to everyone.
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
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

// owner is excluded on purpose — it never gets a row in RolePagePermission,
// see canAccessPage() below.
export const NON_OWNER_ROLES = [
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
] as const satisfies readonly UserRole[];

export type RolePagePermissionMap = Record<PageKey, Set<UserRole>>;

export async function getRolePagePermissionMap(): Promise<RolePagePermissionMap> {
  const rows = await prisma.rolePagePermission.findMany({ where: { allowed: true } });
  const map = Object.fromEntries(
    PAGE_KEYS.map((key) => [key, new Set<UserRole>()]),
  ) as RolePagePermissionMap;
  for (const row of rows) {
    map[row.pageKey as PageKey]?.add(row.role);
  }
  return map;
}

// owner always passes, independent of the table — this is the actual
// enforcement behind "owner can never be locked out," not just a UI
// convenience. A pageKey with no row for a role means denied (fail-safe).
export function canAccessPage(
  role: UserRole,
  pageKey: PageKey,
  map: RolePagePermissionMap,
): boolean {
  if (role === "owner") return true;
  return map[pageKey]?.has(role) ?? false;
}

// Today's default access, one entry per (role, pageKey) — used to seed the
// migration (Task 1) and to power "reset to default" (Task 5). Keep this in
// sync with the migration's seed INSERTs if either ever changes.
export const DEFAULT_ALLOWED_ROLES: Record<PageKey, UserRole[]> = {
  pos: ["shift_supervisor", "cashier"],
  refunds: ["manager", "shift_supervisor"],
  ingredients: ["manager", "shift_supervisor", "cashier", "employee"],
  recipes: ["manager", "shift_supervisor", "cashier"],
  menus: ["manager", "shift_supervisor", "cashier"],
  "modifier-groups": ["manager", "shift_supervisor", "cashier"],
  inventory: ["manager", "shift_supervisor", "employee"],
  suppliers: ["manager", "shift_supervisor"],
  purchases: ["manager", "shift_supervisor"],
  expenses: ["manager", "accountant"],
  reports: ["manager", "shift_supervisor", "accountant"],
  users: ["manager"],
  settings: [],
};

export function buildDefaultPermissionChanges(): {
  role: UserRole;
  pageKey: PageKey;
  allowed: boolean;
}[] {
  return NON_OWNER_ROLES.flatMap((role) =>
    PAGE_KEYS.map((pageKey) => ({
      role,
      pageKey,
      allowed: DEFAULT_ALLOWED_ROLES[pageKey].includes(role),
    })),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/page-access.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/page-access.ts lib/page-access.test.ts
git commit -m "feat: add canAccessPage/getRolePagePermissionMap helper"
```

---

## Task 3: Sidebar — always show every item, disable instead of hide

**Files:**

- Modify: `components/nav-config.ts`
- Test: `components/nav-config.test.ts`
- Modify: `components/app-shell.tsx`

**Interfaces:**

- Consumes: `PageKey`, `RolePagePermissionMap`, `canAccessPage` from `@/lib/page-access` (Task 2).
- Produces: `NavItem` now has an optional `pageKey?: PageKey` field instead of `roles: Set<UserRole>`. `getNavItemsWithState(role, map): (NavGroup & { items: (NavItem & { disabled: boolean })[] })[]`, exported alongside the existing `PAGE_KEY_LABELS: Record<PageKey, string>` and unchanged `ROLE_LABELS`. `AppShell` gains a required `permMap: RolePagePermissionMap` prop, consumed by Task 4's page changes.

- [ ] **Step 1: Write the failing test**

Create `components/nav-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getNavItemsWithState } from "./nav-config";
import { PAGE_KEYS, type RolePagePermissionMap } from "@/lib/page-access";
import type { UserRole } from "@/lib/generated/prisma/enums";

function emptyMap(): RolePagePermissionMap {
  return Object.fromEntries(
    PAGE_KEYS.map((k) => [k, new Set<UserRole>()]),
  ) as RolePagePermissionMap;
}

function findItem(groups: ReturnType<typeof getNavItemsWithState>, href: string) {
  return groups.flatMap((g) => g.items).find((i) => i.href === href);
}

describe("getNavItemsWithState", () => {
  it("keeps every item present even when the role has no access anywhere", () => {
    const groups = getNavItemsWithState("cashier", emptyMap());
    expect(findItem(groups, "/settings")).toBeDefined();
    expect(findItem(groups, "/users")).toBeDefined();
  });

  it("disables an item gated by pageKey when the role isn't in the map", () => {
    const groups = getNavItemsWithState("cashier", emptyMap());
    expect(findItem(groups, "/settings")?.disabled).toBe(true);
  });

  it("enables an item once the role is present in the map", () => {
    const map = emptyMap();
    map.pos.add("cashier");
    const groups = getNavItemsWithState("cashier", map);
    expect(findItem(groups, "/pos")?.disabled).toBe(false);
  });

  it("never disables /dashboard or /guide, regardless of role or map", () => {
    const groups = getNavItemsWithState("cashier", emptyMap());
    expect(findItem(groups, "/dashboard")?.disabled).toBe(false);
    expect(findItem(groups, "/guide")?.disabled).toBe(false);
  });

  it("owner is never disabled anywhere", () => {
    const groups = getNavItemsWithState("owner", emptyMap());
    expect(groups.flatMap((g) => g.items).every((i) => !i.disabled)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/nav-config.test.ts`
Expected: FAIL — `getNavItemsWithState is not a function` (nav-config.ts still exports the old shape).

- [ ] **Step 3: Rewrite `components/nav-config.ts`**

Replace the whole file's content with (keep the same `lucide-react` icon imports at the top unchanged):

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
  type LucideIcon,
} from "lucide-react";
import { canAccessPage, type PageKey, type RolePagePermissionMap } from "@/lib/page-access";
import type { UserRole } from "@/lib/generated/prisma/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // Omitted => always enabled for every role (dashboard, guide) — see
  // lib/page-access.ts's PAGE_KEYS comment for why those two are excluded.
  pageKey?: PageKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nav item list — static shape only. Per-role enabled/disabled state is
// computed at render time by getNavItemsWithState() below, from the
// owner-configurable RolePagePermission table (lib/page-access.ts), not
// hardcoded here anymore.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [{ href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard }],
  },
  {
    label: "ขายหน้าร้าน",
    items: [
      { href: "/pos", label: "หน้าขาย (POS)", icon: ShoppingCart, pageKey: "pos" },
      { href: "/refunds", label: "อนุมัติคืนเงิน", icon: Undo2, pageKey: "refunds" },
    ],
  },
  {
    label: "จัดการร้าน",
    items: [
      { href: "/ingredients", label: "วัตถุดิบ", icon: Package, pageKey: "ingredients" },
      { href: "/recipes", label: "สูตร", icon: BookOpen, pageKey: "recipes" },
      { href: "/menus", label: "เมนู", icon: Coffee, pageKey: "menus" },
      {
        href: "/modifier-groups",
        label: "กลุ่มตัวเลือก",
        icon: SlidersHorizontal,
        pageKey: "modifier-groups",
      },
    ],
  },
  {
    label: "คลังและจัดซื้อ",
    items: [
      { href: "/inventory", label: "สต็อก", icon: Boxes, pageKey: "inventory" },
      { href: "/suppliers", label: "ผู้จำหน่าย", icon: Truck, pageKey: "suppliers" },
      { href: "/purchases", label: "ใบสั่งซื้อ", icon: ClipboardList, pageKey: "purchases" },
    ],
  },
  {
    label: "การเงิน",
    items: [
      { href: "/expenses", label: "ค่าใช้จ่าย", icon: Receipt, pageKey: "expenses" },
      { href: "/reports", label: "รายงาน", icon: BarChart3, pageKey: "reports" },
    ],
  },
  {
    label: "ระบบ",
    items: [
      { href: "/users", label: "จัดการผู้ใช้", icon: Users, pageKey: "users" },
      { href: "/settings", label: "ตั้งค่าระบบ", icon: Settings, pageKey: "settings" },
    ],
  },
  {
    label: "ช่วยเหลือ",
    items: [{ href: "/guide", label: "คู่มือการใช้งาน", icon: HelpCircle }],
  },
];

export function getNavItemsWithState(
  role: UserRole,
  permMap: RolePagePermissionMap,
): (NavGroup & { items: (NavItem & { disabled: boolean })[] })[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      disabled: item.pageKey ? !canAccessPage(role, item.pageKey, permMap) : false,
    })),
  }));
}

// Thai label per pageKey, derived from NAV_GROUPS so it can't drift from the
// sidebar's own labels — used by the Settings permission grid (Task 6).
export const PAGE_KEY_LABELS: Record<PageKey, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items)
    .filter((item): item is NavItem & { pageKey: PageKey } => item.pageKey !== undefined)
    .map((item) => [item.pageKey, item.label]),
) as Record<PageKey, string>;

export const ROLE_LABELS: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  shift_supervisor: "หัวหน้ากะ",
  cashier: "แคชเชียร์",
  employee: "พนักงาน",
  accountant: "ฝ่ายบัญชี",
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/nav-config.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update `components/app-shell.tsx` to render every item, disabled state instead of filtering**

In `components/app-shell.tsx`:

Replace the import line:

```ts
import { NAV_GROUPS, ROLE_LABELS } from "@/components/nav-config";
```

with:

```ts
import { getNavItemsWithState, ROLE_LABELS } from "@/components/nav-config";
import type { RolePagePermissionMap } from "@/lib/page-access";
```

Add `permMap: RolePagePermissionMap` to `AppShellProps` and thread it to both `<Sidebar>` renders:

```ts
interface AppShellProps {
  user: { fullName: string; email: string; role: string };
  logoutAction: () => void | Promise<void>;
  permMap: RolePagePermissionMap;
  children: React.ReactNode;
}
```

```ts
export function AppShell({ user, logoutAction, permMap, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar
        user={user}
        logoutAction={logoutAction}
        permMap={permMap}
        className="hidden lg:flex"
        onNavigate={() => {}}
      />

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            user={user}
            logoutAction={logoutAction}
            permMap={permMap}
            className="relative flex"
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
          />
        </div>
      )}
```

(leave everything else in that return unchanged)

Update the `Sidebar` function signature and body:

```ts
function Sidebar({
  user,
  logoutAction,
  permMap,
  className,
  onNavigate,
  onClose,
}: {
  user: { fullName: string; email: string; role: string };
  logoutAction: () => void | Promise<void>;
  permMap: RolePagePermissionMap;
  className?: string;
  onNavigate: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const groups = getNavItemsWithState(user.role as UserRole, permMap);
```

Replace the `<nav>` block's `.map` (which currently does `visibleGroups.map(...)` with a `<Link>` per item) with:

```tsx
<nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
  {groups.map((group) => (
    <div key={group.label}>
      <p className="text-muted-foreground px-2.5 pb-1.5 text-xs font-medium">{group.label}</p>
      <ul className="space-y-0.5">
        {group.items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const content = (
            <>
              <Icon className="size-4 shrink-0" />
              {item.label}
            </>
          );
          if (item.disabled) {
            return (
              <li key={item.href}>
                <span
                  aria-disabled="true"
                  className="text-muted-foreground flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium opacity-50"
                >
                  {content}
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  ))}
</nav>
```

(everything below `</nav>` — the user dropdown footer and `ConfirmDialog` — is unchanged)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: fails right now with "Property 'permMap' is missing" errors at every `<AppShell>` call site across `app/*/page.tsx` — that's expected and gets fixed in Task 4. Confirm the _only_ errors are missing `permMap` props (no other type errors from this task's edits).

- [ ] **Step 7: Commit**

```bash
git add components/nav-config.ts components/nav-config.test.ts components/app-shell.tsx
git commit -m "feat: sidebar shows every item always, disables instead of hiding"
```

---

## Task 4: Migrate all 13 gated pages to `canAccessPage`

**Files:**

- Modify: `app/dashboard/page.tsx`, `app/pos/page.tsx`, `app/refunds/page.tsx`, `app/ingredients/page.tsx`, `app/recipes/page.tsx`, `app/menus/page.tsx`, `app/modifier-groups/page.tsx`, `app/inventory/page.tsx`, `app/suppliers/page.tsx`, `app/purchases/page.tsx`, `app/expenses/page.tsx`, `app/reports/page.tsx`, `app/users/page.tsx`, `app/settings/page.tsx`
- Verify: `e2e/auth-rbac.spec.ts` (no edits — must still pass)

**Interfaces:**

- Consumes: `getRolePagePermissionMap`, `canAccessPage` from `@/lib/page-access` (Task 2).
- Produces: every page now calls `const permMap = await getRolePagePermissionMap();` once and passes `permMap={permMap}` to `<AppShell>` (Task 3's new required prop).

For every page below except `/dashboard`, the transformation is: fetch `permMap`, replace the hand-written role check with a `canAccessPage` call, and pass `permMap` to every `<AppShell>` render in that file.

- [ ] **Step 1: `app/dashboard/page.tsx` — keeps its own check, but now also supplies `permMap` to `AppShell`**

Add the import:

```ts
import { getRolePagePermissionMap } from "@/lib/page-access";
```

Right after `const canViewDashboard = hasPermission(...)`, add:

```ts
const permMap = await getRolePagePermissionMap();
```

Add `permMap={permMap}` to **both** `<AppShell user={profile.user} logoutAction={logout}>` occurrences in this file (the denied-role welcome-card branch and the normal KPI branch).

- [ ] **Step 2: `app/pos/page.tsx`**

Add import: `import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";`

Replace:

```ts
const role = profile.user.role;
if (role !== "shift_supervisor" && role !== "cashier") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "pos", permMap)) {
  redirect("/dashboard");
}
```

Add `permMap={permMap}` to the `<AppShell>` render.

- [ ] **Step 3: `app/refunds/page.tsx`**

Same pattern. Replace:

```ts
const role = profile.user.role;
if (role !== "owner" && role !== "manager" && role !== "shift_supervisor") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "refunds", permMap)) {
  redirect("/dashboard");
}
```

Add the same import as Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 4: `app/ingredients/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "ingredients", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 5: `app/recipes/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "employee" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "recipes", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 6: `app/menus/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "employee" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "menus", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 7: `app/modifier-groups/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "employee" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "modifier-groups", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 8: `app/inventory/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "cashier" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "inventory", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 9: `app/suppliers/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "cashier" || role === "employee" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "suppliers", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 10: `app/purchases/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role === "cashier" || role === "employee" || role === "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "purchases", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 11: `app/expenses/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role !== "owner" && role !== "manager" && role !== "accountant") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "expenses", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 12: `app/reports/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (
  role !== "owner" &&
  role !== "manager" &&
  role !== "shift_supervisor" &&
  role !== "accountant"
) {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "reports", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 13: `app/users/page.tsx`**

Replace:

```ts
const role = profile.user.role;
if (role !== "owner" && role !== "manager") {
  redirect("/dashboard");
}
```

with:

```ts
const role = profile.user.role;
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(role, "users", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`.

- [ ] **Step 14: `app/settings/page.tsx`**

Replace:

```ts
if (profile.user.role !== "owner") {
  redirect("/dashboard");
}
```

with:

```ts
const permMap = await getRolePagePermissionMap();
if (!canAccessPage(profile.user.role, "settings", permMap)) {
  redirect("/dashboard");
}
```

Add the import from Step 2. Add `permMap={permMap}` to `<AppShell>`. (Task 6 adds more to this file — leave the rest of it as-is for now.)

- [ ] **Step 15: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors (this clears the "missing permMap prop" errors from Task 3's Step 6).

- [ ] **Step 16: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS — no existing unit test touches these page files directly (they test Server Actions, not `page.tsx` components), so nothing here should regress.

- [ ] **Step 17: Run the existing RBAC e2e suite to confirm zero behavior change**

Run: `npx playwright test e2e/auth-rbac.spec.ts`
Expected: PASS, all 6 existing cases — this is the regression guard proving the migration seed (Task 1) reproduced today's access exactly and the new `canAccessPage`-based checks behave identically to the old hand-written ones.

- [ ] **Step 18: Commit**

```bash
git add app/dashboard/page.tsx app/pos/page.tsx app/refunds/page.tsx app/ingredients/page.tsx app/recipes/page.tsx app/menus/page.tsx app/modifier-groups/page.tsx app/inventory/page.tsx app/suppliers/page.tsx app/purchases/page.tsx app/expenses/page.tsx app/reports/page.tsx app/users/page.tsx app/settings/page.tsx
git commit -m "refactor: migrate all page-level access checks to canAccessPage"
```

---

## Task 5: Settings-screen backend — list, update, reset, change log

**Files:**

- Modify: `features/settings/schemas/settings.schema.ts`
- Create: `features/settings/actions/role-page-permissions.ts`
- Test: `features/settings/actions/role-page-permissions.test.ts`

**Interfaces:**

- Consumes: `PAGE_KEYS`, `NON_OWNER_ROLES`, `PageKey`, `buildDefaultPermissionChanges` from `@/lib/page-access` (Task 2); `requirePermission`, `PermissionError` from `@/lib/permissions`; `getSkip`, `getTotalPages` from `@/lib/pagination`.
- Produces: `RolePagePermissionRow` (`{ role: UserRole; pageKey: PageKey; allowed: boolean }`), `listRolePagePermissions()`, `updateRolePagePermissions(input)`, `resetRolePagePermissionsToDefault()`, `PermissionChangeLogEntry`, `listPermissionChangeLog(page)`. Consumed by Task 6's UI components and `app/settings/page.tsx`.

- [ ] **Step 1: Add the update-input schema**

In `features/settings/schemas/settings.schema.ts`, add at the end:

```ts
import { PAGE_KEYS } from "@/lib/page-access";

const NON_OWNER_ROLE_VALUES = [
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
] as const;

export const rolePagePermissionUpdateSchema = z.object({
  changes: z
    .array(
      z.object({
        role: z.enum(NON_OWNER_ROLE_VALUES),
        pageKey: z.enum(PAGE_KEYS),
        allowed: z.coerce.boolean(),
      }),
    )
    .min(1, "ไม่มีการเปลี่ยนแปลง"),
});

export type RolePagePermissionUpdateInput = z.infer<typeof rolePagePermissionUpdateSchema>;
```

(the `import { z } from "zod";` at the top of the file already covers this — just add the new import and block after the existing `reasonCodeUpdateSchema` export)

- [ ] **Step 2: Write the failing tests**

Create `features/settings/actions/role-page-permissions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { prisma } from "@/lib/prisma";
import {
  listRolePagePermissions,
  updateRolePagePermissions,
  resetRolePagePermissionsToDefault,
} from "./role-page-permissions";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "A",
    role,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
});

describe("listRolePagePermissions", () => {
  it("denies a non-owner role", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await listRolePagePermissions();

    expect("error" in result).toBe(true);
  });

  it("returns one row per (non-owner role, pageKey), defaulting to false with no DB row", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);

    const result = await listRolePagePermissions();

    if ("error" in result) throw new Error("expected rows, got error");
    expect(result.rows).toHaveLength(5 * 13);
    expect(result.rows.find((r) => r.role === "cashier" && r.pageKey === "pos")?.allowed).toBe(
      true,
    );
    expect(result.rows.find((r) => r.role === "manager" && r.pageKey === "pos")?.allowed).toBe(
      false,
    );
  });
});

describe("updateRolePagePermissions", () => {
  it("denies a non-owner role and never opens a transaction", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await updateRolePagePermissions({
      changes: [{ role: "cashier", pageKey: "pos", allowed: false }],
    });

    expect("error" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("writes only rows that actually changed, plus one log row per change", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);

    const result = await updateRolePagePermissions({
      changes: [
        { role: "cashier", pageKey: "pos", allowed: true }, // unchanged, must be skipped
        { role: "manager", pageKey: "pos", allowed: true }, // changed false -> true
      ],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "manager", pageKey: "pos" } },
      }),
    );
    expect(prismaMock.permissionChangeLog.createMany).toHaveBeenCalledWith({
      data: [{ role: "manager", pageKey: "pos", allowed: true, changedBy: "actor-1" }],
    });
  });

  it("writes nothing and opens no transaction when no cell actually changed", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);

    const result = await updateRolePagePermissions({
      changes: [{ role: "cashier", pageKey: "pos", allowed: true }],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("resetRolePagePermissionsToDefault", () => {
  it("submits the full default matrix, upserting every allowed pair to true", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);

    const result = await resetRolePagePermissionsToDefault();

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "shift_supervisor", pageKey: "pos" } },
        create: expect.objectContaining({ allowed: true }),
      }),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run features/settings/actions/role-page-permissions.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 4: Write `features/settings/actions/role-page-permissions.ts`**

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getSkip, getTotalPages } from "@/lib/pagination";
import {
  PAGE_KEYS,
  NON_OWNER_ROLES,
  buildDefaultPermissionChanges,
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
  return updateRolePagePermissions({ changes: buildDefaultPermissionChanges() });
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

  return {
    entries: rows.map((r) => ({
      id: r.id,
      role: r.role,
      pageKey: r.pageKey as PageKey,
      allowed: r.allowed,
      changedByName: nameById.get(r.changedBy) ?? "ไม่ทราบ",
      changedAt: r.changedAt,
    })),
    page,
    totalPages: getTotalPages(total, CHANGE_LOG_PAGE_SIZE),
    total,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run features/settings/actions/role-page-permissions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full unit test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS, all suites green (this also implicitly checks the `settings.schema.ts` edit from Step 1 didn't break anything importing that file).

- [ ] **Step 7: Commit**

```bash
git add features/settings/schemas/settings.schema.ts features/settings/actions/role-page-permissions.ts features/settings/actions/role-page-permissions.test.ts
git commit -m "feat: add role-page-permission list/update/reset/log server actions"
```

---

## Task 6: Settings-screen UI — permission grid + change history

**Files:**

- Create: `features/settings/components/role-permission-grid.tsx`
- Create: `features/settings/components/permission-change-log.tsx`
- Modify: `features/settings/components/settings-page-content.tsx`
- Modify: `app/settings/page.tsx`

**Interfaces:**

- Consumes: `updateRolePagePermissions`, `resetRolePagePermissionsToDefault`, `listPermissionChangeLog`, `RolePagePermissionRow` (Task 5); `PAGE_KEYS`, `PageKey` (Task 2); `PAGE_KEY_LABELS`, `ROLE_LABELS` (Task 3); `ConfirmDialog`, `PaginationControls`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Button`, `Badge` (existing shared components).

- [ ] **Step 1: Create `features/settings/components/role-permission-grid.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateRolePagePermissions,
  resetRolePagePermissionsToDefault,
  type RolePagePermissionRow,
} from "../actions/role-page-permissions";
import { PAGE_KEYS, type PageKey } from "@/lib/page-access";
import { PAGE_KEY_LABELS, ROLE_LABELS } from "@/components/nav-config";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const EDITABLE_ROLES = [
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

type Grid = Record<PageKey, Record<EditableRole, boolean>>;

function buildGrid(rows: RolePagePermissionRow[]): Grid {
  const grid = {} as Grid;
  for (const pageKey of PAGE_KEYS) {
    grid[pageKey] = {} as Grid[PageKey];
    for (const role of EDITABLE_ROLES) {
      grid[pageKey][role] = false;
    }
  }
  for (const row of rows) {
    if (row.role === "owner") continue;
    if ((EDITABLE_ROLES as readonly string[]).includes(row.role)) {
      grid[row.pageKey][row.role as EditableRole] = row.allowed;
    }
  }
  return grid;
}

interface RolePermissionGridProps {
  initialRows: RolePagePermissionRow[];
}

// Owner-only permission grid on /settings — app/settings/page.tsx already
// gates the whole page to owner, so no extra check is needed here.
export function RolePermissionGrid({ initialRows }: RolePermissionGridProps) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => buildGrid(initialRows));
  const [grid, setGrid] = useState(() => buildGrid(initialRows));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = PAGE_KEYS.some((pageKey) =>
    EDITABLE_ROLES.some((role) => grid[pageKey][role] !== baseline[pageKey][role]),
  );

  function toggle(pageKey: PageKey, role: EditableRole) {
    setError(null);
    setSavedAt(null);
    setGrid((prev) => ({
      ...prev,
      [pageKey]: { ...prev[pageKey], [role]: !prev[pageKey][role] },
    }));
  }

  function handleSave() {
    const changes = PAGE_KEYS.flatMap((pageKey) =>
      EDITABLE_ROLES.filter((role) => grid[pageKey][role] !== baseline[pageKey][role]).map(
        (role) => ({ role, pageKey, allowed: grid[pageKey][role] }),
      ),
    );
    if (changes.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await updateRolePagePermissions({ changes });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setBaseline(grid);
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function handleReset() {
    setConfirmResetOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await resetRolePagePermissionsToDefault();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หน้าเมนู</TableHead>
              <TableHead className="text-center">{ROLE_LABELS.owner}</TableHead>
              {EDITABLE_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PAGE_KEYS.map((pageKey) => (
              <TableRow key={pageKey}>
                <TableCell>{PAGE_KEY_LABELS[pageKey]}</TableCell>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    aria-label={`${ROLE_LABELS.owner} - ${PAGE_KEY_LABELS[pageKey]}`}
                  />
                </TableCell>
                {EDITABLE_ROLES.map((role) => (
                  <TableCell key={role} className="text-center">
                    <input
                      type="checkbox"
                      checked={grid[pageKey][role]}
                      disabled={isPending}
                      onChange={() => toggle(pageKey, role)}
                      aria-label={`${ROLE_LABELS[role]} - ${PAGE_KEY_LABELS[pageKey]}`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" disabled={!isDirty || isPending} onClick={handleSave}>
          บันทึก
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirmResetOpen(true)}
        >
          รีเซ็ตเป็นค่าเริ่มต้น
        </Button>
        {savedAt && <p className="text-accent text-xs">บันทึกสำเร็จ</p>}
      </div>
      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="รีเซ็ตสิทธิ์เป็นค่าเริ่มต้นใช่ไหม?"
        description="การเปลี่ยนแปลงที่ตั้งค่าไว้ทั้งหมดจะถูกล้างกลับไปเป็นค่าเริ่มต้นของระบบ"
        confirmLabel="รีเซ็ต"
        onConfirm={handleReset}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `features/settings/components/permission-change-log.tsx`**

```tsx
import { listPermissionChangeLog } from "../actions/role-page-permissions";
import { PAGE_KEY_LABELS, ROLE_LABELS } from "@/components/nav-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";

// Async Server Component (like MovementLedger) — rendered directly in
// app/settings/page.tsx, not nested inside the "use client"
// SettingsPageContent, since a client component can't await a server one.
export async function PermissionChangeLog({ page }: { page: number }) {
  const result = await listPermissionChangeLog(page);
  if ("error" in result) {
    return <p className="text-destructive text-sm">{result.error}</p>;
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เมื่อไหร่</TableHead>
            <TableHead>ใคร</TableHead>
            <TableHead>ตำแหน่ง</TableHead>
            <TableHead>หน้า</TableHead>
            <TableHead>เปลี่ยนเป็น</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                ยังไม่มีการเปลี่ยนแปลง
              </TableCell>
            </TableRow>
          ) : (
            result.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(entry.changedAt).toLocaleString("th-TH")}
                </TableCell>
                <TableCell>{entry.changedByName}</TableCell>
                <TableCell>{ROLE_LABELS[entry.role] ?? entry.role}</TableCell>
                <TableCell>{PAGE_KEY_LABELS[entry.pageKey] ?? entry.pageKey}</TableCell>
                <TableCell>
                  <Badge variant={entry.allowed ? "default" : "secondary"}>
                    {entry.allowed ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <PaginationControls
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        basePath="/settings"
      />
    </div>
  );
}
```

- [ ] **Step 3: Wire `RolePermissionGrid` into `settings-page-content.tsx`**

Add the import:

```ts
import { RolePermissionGrid } from "./role-permission-grid";
```

Add `rolePagePermissionRows: import("../actions/role-page-permissions").RolePagePermissionRow[]` to `SettingsPageContentProps`:

```ts
interface SettingsPageContentProps {
  companySettings: CompanySettingsData;
  taxSettings: TaxSettingsData;
  ingredients: IngredientOverrideRow[];
  reasonCodes: ReasonCodeRow[];
  rolePagePermissionRows: RolePagePermissionRow[];
}
```

(add `import type { RolePagePermissionRow } from "../actions/role-page-permissions";` near the top)

In the `SettingsPageContent` function, destructure the new prop and render a new `Card` right after the `รายการเหตุผล (Stock Out)` card and before the `ธีม` card:

```tsx
export function SettingsPageContent({
  companySettings,
  taxSettings,
  ingredients,
  reasonCodes,
  rolePagePermissionRows,
}: SettingsPageContentProps) {
  return (
    <div className="space-y-6">
      <CompanyInfoSection initial={companySettings} />
      <TaxSection initial={taxSettings} />
      <ReceiptSection initial={companySettings} />
      <BusinessHoursSection initial={companySettings} />
      <StockDeficitPolicySection initial={companySettings} ingredients={ingredients} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">รายการเหตุผล (Stock Out)</CardTitle>
          <CardDescription>ใช้เมื่อพนักงานตัดสต็อกออกแบบมีเอกสารอ้างอิง (D12)</CardDescription>
        </CardHeader>
        <CardContent>
          <ReasonCodeManager initialCodes={reasonCodes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สิทธิ์การใช้งานตามตำแหน่ง</CardTitle>
          <CardDescription>
            เลือกได้ว่าตำแหน่งไหนเข้าหน้าเมนูไหนได้บ้าง — เจ้าของร้านเข้าได้ทุกหน้าเสมอ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolePermissionGrid initialRows={rolePagePermissionRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ธีม</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Wire everything into `app/settings/page.tsx`**

Add imports (alongside the existing ones):

```ts
import { listRolePagePermissions } from "@/features/settings/actions/role-page-permissions";
import { PermissionChangeLog } from "@/features/settings/components/permission-change-log";
import { parsePageParam } from "@/lib/pagination";
```

Right after `const message = searchParams?.message as string | undefined;`, add:

```ts
const page = parsePageParam(searchParams?.page);
```

Replace:

```ts
const [thresholdResult, fullSettingsResult, reasonCodesResult] = await Promise.all([
  getRefundApprovalThreshold(),
  getFullSettings(),
  listAllReasonCodes(),
]);
```

with:

```ts
const [thresholdResult, fullSettingsResult, reasonCodesResult, rolePermResult] = await Promise.all([
  getRefundApprovalThreshold(),
  getFullSettings(),
  listAllReasonCodes(),
  listRolePagePermissions(),
]);
```

Replace:

```tsx
<SettingsPageContent
  companySettings={fullSettingsResult.companySettings}
  taxSettings={fullSettingsResult.taxSettings}
  ingredients={fullSettingsResult.ingredients}
  reasonCodes={reasonCodesResult.codes}
/>
```

with:

```tsx
<SettingsPageContent
  companySettings={fullSettingsResult.companySettings}
  taxSettings={fullSettingsResult.taxSettings}
  ingredients={fullSettingsResult.ingredients}
  reasonCodes={reasonCodesResult.codes}
  rolePagePermissionRows={"rows" in rolePermResult ? rolePermResult.rows : []}
/>
```

Add a new Card directly after the closing `</Card>` of the "วงเงินอนุมัติคืนเงินของหัวหน้ากะ" card (still inside the same wrapping `<div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">`, right before that div's closing tag):

```tsx
<Card>
  <CardHeader>
    <CardTitle>ประวัติการเปลี่ยนสิทธิ์</CardTitle>
  </CardHeader>
  <CardContent>
    <PermissionChangeLog page={page} />
  </CardContent>
</Card>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 6: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`, log in as the owner, open `/settings`, confirm the "สิทธิ์การใช้งานตามตำแหน่ง" grid renders with 13 rows × 6 columns (owner column checked and disabled), toggle one checkbox, click "บันทึก", confirm "บันทึกสำเร็จ" appears and a row shows up under "ประวัติการเปลี่ยนสิทธิ์". Stop the dev server after confirming.

- [ ] **Step 8: Commit**

```bash
git add features/settings/components/role-permission-grid.tsx features/settings/components/permission-change-log.tsx features/settings/components/settings-page-content.tsx app/settings/page.tsx
git commit -m "feat: add owner-facing role/page permission grid and change history"
```

---

## Task 7: e2e — owner toggles a page, effect is immediate for that role

**Files:**

- Create: `e2e/role-page-permissions.spec.ts`

**Interfaces:**

- Consumes: `createTestUser`/`deleteTestUser` from `./helpers/test-users`; `loginAs` from `./helpers/login`; `prisma` from `@/lib/prisma` (for test cleanup only).

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { loginAs } from "./helpers/login";
import { prisma } from "@/lib/prisma";

const createdUsers: TestUser[] = [];

async function userFor(role: TestUser["role"]): Promise<TestUser> {
  const user = await createTestUser(role);
  createdUsers.push(user);
  return user;
}

test.afterAll(async () => {
  for (const user of createdUsers) {
    await deleteTestUser(user);
  }
  // Restore the default (accountant can reach reports) so this test doesn't
  // leak state into auth-rbac.spec.ts or any later run of this file.
  await prisma.rolePagePermission.upsert({
    where: { role_pageKey: { role: "accountant", pageKey: "reports" } },
    create: { role: "accountant", pageKey: "reports", allowed: true },
    update: { allowed: true },
  });
});

test("owner disabling a page for a role takes effect immediately for that role", async ({
  page,
  browser,
}) => {
  const owner = await userFor("owner");
  const accountant = await userFor("accountant");

  await loginAs(page, owner.email, owner.password);
  await page.goto("/settings");

  await page.getByRole("checkbox", { name: "ฝ่ายบัญชี - รายงาน" }).uncheck();
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByText("บันทึกสำเร็จ")).toBeVisible();

  const accountantContext = await browser.newContext();
  const accountantPage = await accountantContext.newPage();
  await loginAs(accountantPage, accountant.email, accountant.password);

  // Disabled sidebar items render without a link role (see app-shell.tsx).
  await expect(accountantPage.getByRole("link", { name: "รายงาน" })).toHaveCount(0);

  await accountantPage.goto("/reports");
  await expect(accountantPage).toHaveURL(/\/dashboard$/);

  await accountantContext.close();
});
```

- [ ] **Step 2: Run the new e2e test**

Run: `npx playwright test e2e/role-page-permissions.spec.ts`
Expected: PASS

- [ ] **Step 3: Run the full e2e suite to confirm no cross-test leakage**

Run: `npx playwright test`
Expected: PASS, including all 6 `auth-rbac.spec.ts` cases (the `afterAll` cleanup in Step 1 restores the accountant/reports default before other files run).

- [ ] **Step 4: Commit**

```bash
git add e2e/role-page-permissions.spec.ts
git commit -m "test: add e2e coverage for owner-configured page permissions"
```

---

## Task 8: Record the RBAC decision

**Files:**

- Modify: `docs/DECISIONS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add a new decision entry**

Add after `## D18 — User Acceptance Testing (UAT) ก่อน Go-Live` (before the `## D-Note` section), following the same `**Decision**/**Rationale**/**Impact**/**Review Trigger**` structure used by every other entry in this file:

```markdown
---

## D19 — เจ้าของร้านตั้งค่าสิทธิ์เข้าหน้าเมนูได้เอง (Owner-Configurable Page Access)

**Decision**: เพิ่มตาราง `role_page_permissions` ให้เจ้าของร้านกำหนดเองได้ว่าแต่ละตำแหน่ง (role) เปิดหน้าเมนูไหนได้บ้าง — คุมแค่ระดับ "เข้าหน้าได้ไหม" เท่านั้น ไม่แตะระดับการกระทำ (สร้าง/แก้/ลบ) ซึ่งยังคุมโดยตาราง `lib/permissions.ts` เดิม `owner` ไม่มีแถวในตารางนี้และเข้าได้ทุกหน้าเสมอ ไม่มีทางถูกปิดกั้นตัวเอง `/dashboard` และ `/guide` ไม่อยู่ในระบบนี้ (ดูรายละเอียดที่ `docs/superpowers/specs/2026-07-30-role-page-permissions-design.md`)

**Rationale**: ก่อนหน้านี้แต่ละหน้าเขียนเช็คสิทธิ์เองแบบ hardcode (`if (role === "cashier") redirect(...)`) กระจายอยู่ 13 ไฟล์ เจ้าของร้านแก้อะไรไม่ได้เลยนอกจากขอให้แก้โค้ดแล้ว deploy ใหม่ ทำให้ปรับสิทธิ์ตามการเปลี่ยนแปลงหน้างานจริงไม่ทัน

**Impact**: `SECURITY.md` §1 (เพิ่มหมายเหตุว่าการเข้าหน้าเมนูตอนนี้เป็น runtime-configurable, ไม่ใช่ hardcode), Phase ใหม่ (เพิ่มหน้าเมนู 14 ต้องเพิ่มแถว default ให้ `RolePagePermission` ด้วยเสมอ มิฉะนั้นทุก role เข้าไม่ได้โดยปริยาย)

**Review Trigger**: ถ้าในอนาคตต้องคุมระดับการกระทำ (create/update/delete) แบบตั้งค่าได้เหมือนกัน ไม่ใช่แค่ระดับหน้า ให้ทบทวนใหม่ทั้งระบบร่วมกับ `lib/permissions.ts` แทนที่จะแปะเพิ่มทีละจุด
```

- [ ] **Step 2: Commit**

```bash
git add docs/DECISIONS.md
git commit -m "docs: record D19 - owner-configurable page access"
```

---

## Self-Review Notes

- **Spec coverage**: §3 data model → Task 1. §4 helper → Task 2. §5 sidebar → Task 3. §4's "every page" gate → Task 4. §6 settings screen + audit history → Tasks 5-6. §7 seeding → Task 1. §8 testing → spread across Tasks 2, 5, 4 (existing e2e), 7 (new e2e). §9 decision log → Task 8. §2's dashboard/guide exclusion → enforced in Task 2's `PAGE_KEYS` (excludes them) and Task 3's optional `pageKey` (both items omit it).
- **Type consistency checked**: `canAccessPage(role, pageKey, map)` signature identical across Task 2 (definition), Task 3 (`getNavItemsWithState`), Task 4 (every page). `RolePagePermissionRow` shape identical across Task 5 (definition) and Task 6 (consumption). The Prisma compound-unique key `role_pageKey` used consistently in Task 5's action and Task 7's e2e cleanup.
- **No placeholders**: every step has literal file paths and complete code; no "add appropriate handling" language.
