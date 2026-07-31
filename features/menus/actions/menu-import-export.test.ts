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
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { MENU_IMPORT_COLUMNS } from "../schemas/menu-import.schema";
import { previewMenuImport, commitMenuImport, exportMenus } from "./menu-import-export";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;
const C = MENU_IMPORT_COLUMNS;

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
});

function fileWithRows(rows: Record<string, unknown>[]): string {
  const columns = Object.values(C).map((label) => ({ key: label as never, label }));
  const buffer = buildSpreadsheet(rows, columns, "xlsx");
  return buffer.toString("base64");
}

describe("previewMenuImport", () => {
  it("denies a role without menu-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await previewMenuImport(fileWithRows([]));

    expect("error" in result).toBe(true);
  });

  it("parses the file and returns creatable/error buckets", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menu.findMany.mockResolvedValue([] as never);
    prismaMock.recipe.findMany.mockResolvedValue([{ id: "recipe-1", name: "ชาไทย" }] as never);

    const fileBase64 = fileWithRows([
      { [C.name]: "ชาไทยเย็น", [C.recipeName]: "ชาไทย", [C.basePrice]: 45 },
    ]);

    const result = await previewMenuImport(fileBase64);

    if ("error" in result) throw new Error("expected buckets, got error");
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].recipeId).toBe("recipe-1");
  });
});

describe("commitMenuImport", () => {
  it("denies a role without menu-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await commitMenuImport([]);

    expect("error" in result).toBe(true);
  });

  it("creates a menu, auto-creating a category by name", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findUnique.mockResolvedValue({ id: "recipe-1", deletedAt: null } as never);
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.create.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.menu.create.mockResolvedValue({ id: "menu-1" } as never);

    const result = await commitMenuImport([
      {
        rowNumber: 2,
        name: "ชาไทยเย็น",
        categoryName: "เครื่องดื่มเย็น",
        categoryType: "drink",
        recipeId: "recipe-1",
        recipeName: "ชาไทย",
        basePrice: 45,
        imageUrl: null,
        isAvailable: true,
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(1);
    expect(prismaMock.menuCategory.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.menu.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "ชาไทยเย็น",
          categoryId: "cat-1",
          recipeId: "recipe-1",
        }),
      }),
    );
  });

  it("reuses one category across two rows naming the same category", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findUnique.mockResolvedValue({ id: "recipe-1", deletedAt: null } as never);
    prismaMock.menu.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.menuCategory.create.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.menu.create.mockResolvedValue({ id: "menu-x" } as never);

    await commitMenuImport([
      {
        rowNumber: 2,
        name: "A",
        categoryName: "หมวดเดียวกัน",
        categoryType: "drink",
        recipeId: "recipe-1",
        recipeName: "ชาไทย",
        basePrice: 1,
        imageUrl: null,
        isAvailable: true,
      },
      {
        rowNumber: 3,
        name: "B",
        categoryName: "หมวดเดียวกัน",
        categoryType: "drink",
        recipeId: "recipe-1",
        recipeName: "ชาไทย",
        basePrice: 1,
        imageUrl: null,
        isAvailable: true,
      },
    ]);

    expect(prismaMock.menuCategory.create).toHaveBeenCalledTimes(1);
  });

  it("skips a row whose recipe was deleted since preview", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findUnique.mockResolvedValue(null as never);

    const result = await commitMenuImport([
      {
        rowNumber: 2,
        name: "ชาไทยเย็น",
        categoryName: null,
        categoryType: null,
        recipeId: "recipe-1",
        recipeName: "ชาไทย",
        basePrice: 45,
        imageUrl: null,
        isAvailable: true,
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(prismaMock.menu.create).not.toHaveBeenCalled();
  });
});

describe("exportMenus", () => {
  it("denies a role without menu-view permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await exportMenus("csv");

    expect("error" in result).toBe(true);
  });

  it("returns a base64 file for the current menu list", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.menu.findMany.mockResolvedValue([
      {
        name: "ชาไทยเย็น",
        category: { name: "เครื่องดื่มเย็น", type: "drink" },
        recipe: { name: "ชาไทย" },
        basePrice: { toString: () => "45" },
        imageUrl: null,
        isAvailable: true,
      },
    ] as never);

    const result = await exportMenus("csv");

    if ("error" in result) throw new Error("expected success");
    expect(result.filename).toBe("menus-export.csv");
    expect(result.fileBase64.length).toBeGreaterThan(0);
  });
});
