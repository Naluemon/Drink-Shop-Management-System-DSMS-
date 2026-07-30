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
