import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

import { prisma } from "@/lib/prisma";
import { getRolePagePermissionMap } from "./page-access-server";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
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
