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
