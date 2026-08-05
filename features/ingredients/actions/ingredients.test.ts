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

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import {
  markIngredientOpened,
  clearIngredientOpened,
  createIngredient,
  listIngredients,
  listSuppliers,
} from "./ingredients";

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

describe("listIngredients / listSuppliers", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findMany.mockResolvedValue([] as never);
    prismaMock.supplier.findMany.mockResolvedValue([] as never);
  });

  // Regression test: both queries used to filter only on `deletedAt: null`
  // with no branchId/organization scoping at all — every organization could
  // see every other organization's ingredients, while createIngredient
  // (writes) already scoped correctly by branch. See DATABASE.md §2.
  it("listIngredients scopes the query to the actor's branch", async () => {
    await listIngredients();

    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "branch-1" }),
      }),
    );
  });

  it("listSuppliers scopes the query to the actor's branch", async () => {
    await listSuppliers();

    expect(prismaMock.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "branch-1" }),
      }),
    );
  });
});

describe("createIngredient", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.ingredient.create.mockResolvedValue(ingredientRow({ currentStockQty: 0 }) as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "mv-1" } as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);
  });

  const baseInput = {
    name: "ผงชาไทย",
    baseUnit: "gram" as const,
    costPerUnit: 1,
    lowStockThreshold: "" as const,
    shelfLifeDaysAfterOpening: "" as const,
    supplierId: "",
  };

  // Regression test: createIngredient used to return the ingredient object
  // from prisma.ingredient.create() as-is, which still had currentStockQty
  // at its pre-stock-in value (0) even after recordStockIn wrote the real
  // quantity — the create dialog then passed that stale "0" straight into
  // the list's optimistic row, so a freshly created ingredient always showed
  // 0 stock in the table until a full page refetch.
  it("returns the post-stock-in currentStockQty, not the value from before recordStockIn ran", async () => {
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(
      ingredientRow({ currentStockQty: 50, unitConversions: [] }) as never,
    );

    const result = await createIngredient({ ...baseInput, startingStock: 50 });

    expect(result.success).toBe(true);
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 50 }) }),
    );
    expect(result.ingredient!.currentStockQty).toBe(50);
  });

  // Regression test: purchase-unit rows entered on the create form couldn't
  // be persisted before this fix (UnitConversion.ingredientId is a required
  // FK, so there was no id to attach them to until a later edit). They're
  // now created right after the ingredient row exists and returned so the
  // list/edit dialog see them immediately.
  it("creates unit conversions passed at creation time against the new ingredient's id", async () => {
    prismaMock.unitConversion.create.mockResolvedValue({
      id: "uc-1",
      purchaseUnitName: "กล่อง 946ml",
      conversionFactor: 12,
    } as never);
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(
      ingredientRow({
        currentStockQty: 0,
        unitConversions: [{ id: "uc-1", purchaseUnitName: "กล่อง 946ml", conversionFactor: 12 }],
      }) as never,
    );

    const result = await createIngredient({
      ...baseInput,
      startingStock: "",
      unitConversions: [{ purchaseUnitName: "กล่อง 946ml", conversionFactor: 12 }],
    });

    expect(result.success).toBe(true);
    expect(prismaMock.unitConversion.create).toHaveBeenCalledWith({
      data: {
        ingredientId: "ing-1",
        purchaseUnitName: "กล่อง 946ml",
        conversionFactor: 12,
      },
    });
    expect(result.ingredient!.unitConversions).toEqual([
      { id: "uc-1", purchaseUnitName: "กล่อง 946ml", conversionFactor: 12 },
    ]);
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
