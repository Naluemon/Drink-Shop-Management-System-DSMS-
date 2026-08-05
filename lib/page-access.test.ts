import { describe, it, expect } from "vitest";
import {
  PAGE_KEYS,
  NON_OWNER_ROLES,
  canAccessPage,
  buildDefaultPermissionChanges,
  isDefaultAllowed,
  type RolePagePermissionMap,
} from "./page-access";
import { hasPermission } from "./permissions";
import type { UserRole } from "@/lib/generated/prisma/enums";

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

// The revoke-only ceiling (D19, narrowed at final review): the seeded
// defaults are the maximum, never a starting point to grow from.
describe("isDefaultAllowed", () => {
  it("agrees with buildDefaultPermissionChanges() for every (role, page) pair", () => {
    for (const change of buildDefaultPermissionChanges()) {
      expect(isDefaultAllowed(change.role, change.pageKey)).toBe(change.allowed);
    }
  });

  it("is true for owner on every page (owner is never in the table)", () => {
    for (const pageKey of PAGE_KEYS) {
      expect(isDefaultAllowed("owner", pageKey)).toBe(true);
    }
  });

  it("keeps SECURITY.md §1's hard exclusions un-grantable", () => {
    expect(isDefaultAllowed("accountant", "pos")).toBe(false);
    expect(isDefaultAllowed("accountant", "inventory")).toBe(false);
    expect(isDefaultAllowed("accountant", "settings")).toBe(false);
    expect(isDefaultAllowed("accountant", "users")).toBe(false);
    for (const role of NON_OWNER_ROLES) {
      expect(isDefaultAllowed(role, "settings")).toBe(false);
    }
  });
});

// app/pos/page.tsx trusts that anyone who can open "pos" can also sell —
// no separate "you can view but not use this page" fallback. That only holds
// because every role that can ever pass canAccessPage("pos") (owner always;
// shift_supervisor/cashier via the seeded defaults, revoke-only) also has
// "create pos_sale".
describe("pos page-gate vs CRUD matrix consistency", () => {
  it("every non-owner role allowed 'pos' by default also has 'create pos_sale'", () => {
    for (const role of NON_OWNER_ROLES) {
      if (isDefaultAllowed(role, "pos")) {
        expect(hasPermission(role, "create", "pos_sale")).toBe(true);
      }
    }
  });

  it("owner can always open 'pos' and sell", () => {
    expect(canAccessPage("owner", "pos", emptyMap())).toBe(true);
    expect(hasPermission("owner", "create", "pos_sale")).toBe(true);
  });
});

describe("history page — owner only, permanently", () => {
  it("is never in the default-allowed ceiling for any non-owner role", () => {
    for (const role of NON_OWNER_ROLES) {
      expect(isDefaultAllowed(role, "history")).toBe(false);
    }
  });

  it("owner can always open it regardless of the permission map", () => {
    expect(canAccessPage("owner", "history", emptyMap())).toBe(true);
  });

  it("no non-owner role can access it even with an all-true map (can't be granted beyond the ceiling)", () => {
    const allTrueMap = Object.fromEntries(
      PAGE_KEYS.map((key) => [key, new Set(NON_OWNER_ROLES)]),
    ) as RolePagePermissionMap;
    for (const role of NON_OWNER_ROLES) {
      // canAccessPage itself would say true here (it just reads the map) —
      // this documents that this feature's real guarantee is
      // isDefaultAllowed's ceiling on what buildDefaultPermissionChanges /
      // the Settings screen can ever set that map to, not canAccessPage.
      expect(canAccessPage(role, "history", allTrueMap)).toBe(true);
      expect(isDefaultAllowed(role, "history")).toBe(false);
    }
  });
});
