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
import {
  createMenuCategory,
  updateMenuCategory,
  softDeleteMenuCategory,
  createMenu,
  updateMenu,
  softDeleteMenu,
  addMenuVariant,
  removeMenuVariant,
  setMenuModifierGroups,
} from "./menus";

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

function menuRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "menu-1",
    branchId: "branch-1",
    name: "ชาไทยเย็น",
    recipeId: "recipe-1",
    categoryId: null,
    basePrice: { toString: () => "45" },
    imageUrl: null,
    isAvailable: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb === "function") {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(cb as Promise<unknown>[]);
  });
});

describe("createMenuCategory", () => {
  it("records a created audit log entry", async () => {
    prismaMock.menuCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.create.mockResolvedValue(categoryRow() as never);

    await createMenuCategory({ name: "เครื่องดื่มเย็น", type: "drink" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "menu_category" }),
      }),
    );
  });
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
    prismaMock.menuCategory.findUnique.mockResolvedValue(categoryRow() as never);
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

  it("records a deleted audit log entry", async () => {
    prismaMock.menuCategory.findUnique.mockResolvedValue(categoryRow() as never);
    prismaMock.menuCategory.update.mockResolvedValue({} as never);

    await softDeleteMenuCategory("cat-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "menu_category" }),
      }),
    );
  });
});

describe("createMenu / updateMenu / softDeleteMenu audit logging", () => {
  const menuInput = {
    name: "ชาไทยเย็น",
    recipeId: "recipe-1",
    categoryId: "",
    basePrice: 45,
    imageUrl: "",
    isAvailable: true,
  };

  it("createMenu records a created entry", async () => {
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menu.create.mockResolvedValue(menuRow() as never);

    await createMenu(menuInput);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "menu" }),
      }),
    );
  });

  it("updateMenu records an updated entry with a diff when the price changes", async () => {
    prismaMock.menu.findUnique.mockResolvedValue(
      menuRow({ basePrice: { toString: () => "45" } }) as never,
    );
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menu.update.mockResolvedValue({} as never);

    await updateMenu("menu-1", { ...menuInput, basePrice: 50 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([{ field: "basePrice", oldValue: "45", newValue: "50" }]),
        }),
      }),
    );
  });

  it("softDeleteMenu records a deleted entry", async () => {
    prismaMock.menu.findUnique.mockResolvedValue(menuRow() as never);
    prismaMock.menu.update.mockResolvedValue({} as never);

    await softDeleteMenu("menu-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "menu" }),
      }),
    );
  });
});

describe("addMenuVariant / removeMenuVariant / setMenuModifierGroups audit logging", () => {
  it("addMenuVariant records a created entry", async () => {
    prismaMock.menu.findUnique.mockResolvedValue(menuRow() as never);
    prismaMock.menuVariant.create.mockResolvedValue({
      id: "var-1",
      name: "ใหญ่",
      recipeMultiplier: null,
      overrideRecipeId: null,
      priceDelta: { toString: () => "10" },
      isDefault: false,
    } as never);

    await addMenuVariant("menu-1", {
      name: "ใหญ่",
      mode: "multiplier",
      recipeMultiplier: 1.5,
      priceDelta: 10,
      isDefault: false,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "menu_variant" }),
      }),
    );
  });

  it("removeMenuVariant records a deleted entry", async () => {
    prismaMock.menuVariant.findUnique.mockResolvedValue({
      id: "var-1",
      name: "ใหญ่",
      menu: menuRow(),
    } as never);
    prismaMock.menuVariant.update.mockResolvedValue({} as never);

    await removeMenuVariant("var-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "menu_variant" }),
      }),
    );
  });

  it("setMenuModifierGroups records an updated entry on the menu", async () => {
    prismaMock.menu.findUnique.mockResolvedValue(menuRow() as never);
    prismaMock.menuModifierGroup.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.menuModifierGroup.createMany.mockResolvedValue({ count: 1 } as never);

    await setMenuModifierGroups("menu-1", ["group-1"]);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "updated", entityType: "menu" }),
      }),
    );
  });
});
