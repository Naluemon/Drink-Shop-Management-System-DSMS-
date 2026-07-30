import type { UserRole } from "@/lib/generated/prisma/enums";

// Client-safe on purpose: everything below is pure (no I/O), so it's cheap to
// import from a "use client" component tree (components/nav-config.ts ->
// components/app-shell.tsx does exactly this, for canAccessPage). The one
// DB-touching function this feature needs, getRolePagePermissionMap(), lives
// in the sibling ./page-access-server.ts instead — see that file's comment
// for why mixing the two here crashes the browser build.

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
