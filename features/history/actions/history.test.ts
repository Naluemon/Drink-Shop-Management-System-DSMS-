import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import { listAuditLogs } from "./history";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

describe("listAuditLogs", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await listAuditLogs();

    expect("error" in result).toBe(true);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("rejects a non-owner role", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await listAuditLogs();

    expect("error" in result).toBe(true);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the actor's branch and paginates", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.auditLog.count.mockResolvedValue(1 as never);
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        branchId: "branch-1",
        actorId: "actor-1",
        actorName: "เจ้าของร้าน",
        action: "updated",
        entityType: "ingredient",
        entityId: "ing-1",
        entityName: "ผงชาไทย",
        changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
        createdAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    ] as never);

    const result = await listAuditLogs();

    expect("logs" in result && result.logs).toHaveLength(1);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "branch-1" }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("applies actor/entityType/action/search filters", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.auditLog.count.mockResolvedValue(0 as never);
    prismaMock.auditLog.findMany.mockResolvedValue([] as never);

    await listAuditLogs({
      actorId: "actor-2",
      entityType: "ingredient",
      action: "deleted",
      search: "ชา",
    });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: "branch-1",
          actorId: "actor-2",
          entityType: "ingredient",
          action: "deleted",
          entityName: { contains: "ชา", mode: "insensitive" },
        }),
      }),
    );
  });
});
