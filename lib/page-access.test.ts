import { describe, it, expect } from "vitest";
import {
  PAGE_KEYS,
  canAccessPage,
  buildDefaultPermissionChanges,
  type RolePagePermissionMap,
} from "./page-access";
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
