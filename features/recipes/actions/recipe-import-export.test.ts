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
import { RECIPE_IMPORT_COLUMNS } from "../schemas/recipe-import.schema";
import { previewRecipeImport, commitRecipeImport, exportRecipes } from "./recipe-import-export";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;
const C = RECIPE_IMPORT_COLUMNS;

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

function fileWithRows(rows: Record<string, unknown>[]): string {
  const columns = Object.values(C).map((label) => ({ key: label as never, label }));
  const buffer = buildSpreadsheet(rows, columns, "xlsx");
  return buffer.toString("base64");
}

describe("previewRecipeImport", () => {
  it("denies a role without recipe-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await previewRecipeImport(fileWithRows([]));

    expect("error" in result).toBe(true);
  });

  it("groups rows by recipe name and reports the toCreate/errors buckets", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findMany.mockResolvedValue([] as never);
    prismaMock.ingredient.findMany.mockResolvedValue([
      { id: "ing-1", name: "ใบชา", baseUnit: "gram" },
      { id: "ing-2", name: "น้ำตาล", baseUnit: "gram" },
    ] as never);

    const fileBase64 = fileWithRows([
      { [C.recipeName]: "ชาไทย", [C.yield]: 10, [C.ingredientName]: "ใบชา", [C.quantity]: 50 },
      { [C.recipeName]: "ชาไทย", [C.yield]: 10, [C.ingredientName]: "น้ำตาล", [C.quantity]: 20 },
    ]);

    const result = await previewRecipeImport(fileBase64);

    if ("error" in result) throw new Error("expected buckets, got error");
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].ingredients).toHaveLength(2);
  });
});

describe("commitRecipeImport", () => {
  it("denies a role without recipe-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await commitRecipeImport([]);

    expect("error" in result).toBe(true);
  });

  it("creates a recipe and its ingredient lines in a transaction", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findFirst.mockResolvedValue(null as never);
    prismaMock.recipe.create.mockResolvedValue({ id: "recipe-1" } as never);
    prismaMock.recipeIngredient.createMany.mockResolvedValue({ count: 2 } as never);

    const result = await commitRecipeImport([
      {
        name: "ชาไทย",
        yield: 10,
        ingredients: [
          { ingredientId: "ing-1", ingredientName: "ใบชา", baseUnit: "gram", quantity: 50 },
          { ingredientId: "ing-2", ingredientName: "น้ำตาล", baseUnit: "gram", quantity: 20 },
        ],
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(1);
    expect(prismaMock.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "ชาไทย", yield: 10 }) }),
    );
    expect(prismaMock.recipeIngredient.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { recipeId: "recipe-1", ingredientId: "ing-1", quantity: 50 },
          { recipeId: "recipe-1", ingredientId: "ing-2", quantity: 20 },
        ],
      }),
    );
  });

  it("skips a recipe whose name was created by a concurrent import since preview", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findFirst.mockResolvedValue({ id: "already-exists" } as never);

    const result = await commitRecipeImport([
      {
        name: "ซ้ำ",
        yield: 1,
        ingredients: [
          { ingredientId: "ing-1", ingredientName: "ใบชา", baseUnit: "gram", quantity: 1 },
        ],
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(0);
    expect(result.invalidRows).toEqual([{ name: "ซ้ำ", reason: "มีสูตรชื่อนี้อยู่แล้ว" }]);
    expect(prismaMock.recipe.create).not.toHaveBeenCalled();
  });

  it("skips a crafted row with no ingredients rather than throwing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);

    const result = await commitRecipeImport([{ name: "ว่างเปล่า", yield: 1, ingredients: [] }]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(0);
    expect(result.invalidRows).toHaveLength(1);
    expect(prismaMock.recipe.create).not.toHaveBeenCalled();
  });
});

describe("exportRecipes", () => {
  it("denies a role without recipe-view permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await exportRecipes("csv");

    expect("error" in result).toBe(true);
  });

  it("returns a base64 file, one row per ingredient line, skipping ingredient-less recipes", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.recipe.findMany.mockResolvedValue([
      {
        name: "ชาไทย",
        yield: { toString: () => "10" },
        ingredients: [
          {
            quantity: { toString: () => "50" },
            ingredient: { name: "ใบชา" },
          },
        ],
      },
      { name: "ว่างเปล่า", yield: { toString: () => "1" }, ingredients: [] },
    ] as never);

    const result = await exportRecipes("csv");

    if ("error" in result) throw new Error("expected success");
    expect(result.filename).toBe("recipes-export.csv");
    expect(result.fileBase64.length).toBeGreaterThan(0);
  });
});
