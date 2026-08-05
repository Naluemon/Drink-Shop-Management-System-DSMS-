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
import { updateMenuCategory, softDeleteMenuCategory } from "./menus";

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

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat-1",
    branchId: "branch-1",
    name: "เครื่องดื่มเย็น",
    type: "drink",
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

describe("updateMenuCategory", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await updateMenuCategory("cat-1", { name: "x", type: "drink" });

    expect(result.error).toBeTruthy();
    expect(prismaMock.menuCategory.update).not.toHaveBeenCalled();
  });

  it("rejects a role with no update permission on menu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await updateMenuCategory("cat-1", { name: "x", type: "drink" });

    expect(result.error).toBeTruthy();
    expect(prismaMock.menuCategory.update).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name already used by another category in the same branch", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menuCategory.findUnique.mockResolvedValue(categoryRow() as never);
    prismaMock.menuCategory.findFirst.mockResolvedValue(
      categoryRow({ id: "cat-2", name: "ของทานเล่น" }) as never,
    );

    const result = await updateMenuCategory("cat-1", { name: "ของทานเล่น", type: "drink" });

    expect(result.error).toBeTruthy();
    expect(prismaMock.menuCategory.update).not.toHaveBeenCalled();
  });

  it("renames the category and updates its type", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menuCategory.findUnique.mockResolvedValue(categoryRow() as never);
    prismaMock.menuCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.update.mockResolvedValue({} as never);

    const result = await updateMenuCategory("cat-1", { name: "เครื่องดื่มร้อน", type: "food" });

    expect(result.success).toBe(true);
    expect(prismaMock.menuCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ name: "เครื่องดื่มร้อน", type: "food" }),
      }),
    );
  });
});

describe("softDeleteMenuCategory", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await softDeleteMenuCategory("cat-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.menuCategory.update).not.toHaveBeenCalled();
  });

  it("rejects a role with no delete permission on menu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("shift_supervisor") as never);

    const result = await softDeleteMenuCategory("cat-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.menuCategory.update).not.toHaveBeenCalled();
  });

  it("sets deletedAt for an owner", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menuCategory.update.mockResolvedValue({} as never);

    const result = await softDeleteMenuCategory("cat-1");

    expect(result.success).toBe(true);
    expect(prismaMock.menuCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});
