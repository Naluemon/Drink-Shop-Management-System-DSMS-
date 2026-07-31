import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §4 — markIngredientOpened/clearIngredientOpened are new: they
// gate on the same "update ingredient" permission as the rest of this file,
// plus a guard that only an ingredient with shelfLifeDaysAfterOpening set can
// be marked opened at all.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { prisma } from "@/lib/prisma";
import { markIngredientOpened, clearIngredientOpened } from "./ingredients";

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

function ingredientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ing-1",
    name: "ผงชาไทย",
    shelfLifeDaysAfterOpening: 7,
    openedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

describe("markIngredientOpened", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await markIngredientOpened("ing-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects a role with no update permission on ingredient", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await markIngredientOpened("ing-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects an ingredient that was never found", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(null as never);

    const result = await markIngredientOpened("missing");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects an ingredient with no shelfLifeDaysAfterOpening configured", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(
      ingredientRow({ shelfLifeDaysAfterOpening: null }) as never,
    );

    const result = await markIngredientOpened("ing-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("sets openedAt to now for a configured ingredient", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(ingredientRow() as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);

    const result = await markIngredientOpened("ing-1");

    expect(result.success).toBe(true);
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ing-1" },
        data: expect.objectContaining({ openedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("clearIngredientOpened", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await clearIngredientOpened("ing-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects a role with no update permission on ingredient", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await clearIngredientOpened("ing-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("clears openedAt back to null", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findUnique.mockResolvedValue(
      ingredientRow({ openedAt: new Date() }) as never,
    );
    prismaMock.ingredient.update.mockResolvedValue({} as never);

    const result = await clearIngredientOpened("ing-1");

    expect(result.success).toBe(true);
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ing-1" },
        data: expect.objectContaining({ openedAt: null }),
      }),
    );
  });
});
