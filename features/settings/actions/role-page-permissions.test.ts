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
