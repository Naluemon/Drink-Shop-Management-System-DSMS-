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
  createRecipe,
  updateRecipe,
  softDeleteRecipe,
  addRecipeIngredient,
  removeRecipeIngredient,
} from "./recipes";

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

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "recipe-1",
    branchId: "branch-1",
    name: "ชาไทยเย็น",
    yield: { toString: () => "1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createRecipe", () => {
  it("records a created audit log entry", async () => {
    prismaMock.recipe.findFirst.mockResolvedValue(null as never);
    prismaMock.recipe.create.mockResolvedValue(recipeRow() as never);

    await createRecipe({ name: "ชาไทยเย็น", yield: 1 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "recipe" }),
      }),
    );
  });
});

describe("updateRecipe", () => {
  it("records an updated entry when the yield changes", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(
      recipeRow({ yield: { toString: () => "1" } }) as never,
    );
    prismaMock.recipe.findFirst.mockResolvedValue(null as never);
    prismaMock.recipe.update.mockResolvedValue({} as never);

    await updateRecipe("recipe-1", { name: "ชาไทยเย็น", yield: 2 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([{ field: "yield", oldValue: "1", newValue: "2" }]),
        }),
      }),
    );
  });
});

describe("softDeleteRecipe", () => {
  it("records a deleted entry", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(recipeRow() as never);
    prismaMock.recipe.update.mockResolvedValue({} as never);

    await softDeleteRecipe("recipe-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "recipe" }),
      }),
    );
  });
});

describe("addRecipeIngredient / removeRecipeIngredient", () => {
  it("addRecipeIngredient records a created entry", async () => {
    prismaMock.recipe.findUnique.mockResolvedValue(recipeRow() as never);
    prismaMock.ingredient.findUnique.mockResolvedValue({
      id: "ing-1",
      name: "ไข่มุก",
      baseUnit: "gram",
    } as never);
    prismaMock.recipeIngredient.create.mockResolvedValue({
      id: "ri-1",
      quantity: { toString: () => "30" },
    } as never);

    await addRecipeIngredient("recipe-1", { ingredientId: "ing-1", quantity: 30 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "recipe_ingredient" }),
      }),
    );
  });

  it("removeRecipeIngredient records a deleted entry", async () => {
    prismaMock.recipeIngredient.findUnique.mockResolvedValue({
      id: "ri-1",
      recipe: recipeRow(),
      ingredient: { name: "ไข่มุก" },
    } as never);
    prismaMock.recipeIngredient.delete.mockResolvedValue({} as never);

    await removeRecipeIngredient("ri-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "recipe_ingredient" }),
      }),
    );
  });
});
