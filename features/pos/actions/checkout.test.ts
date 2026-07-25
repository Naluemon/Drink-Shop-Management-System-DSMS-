import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §3 TC-DEF-01 (at POS) and DECISIONS.md D16 (tax invoice
// numbering: continuous, only real non-voided sales consume a number).
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

let isVatRegistered = false;
let stockDeficitPolicy: "warn_only" | "strict_block" = "warn_only";
vi.mock("@/lib/settings", () => ({
  getOrCreateTaxSettings: vi.fn(async () => ({ vatMode: "inclusive", vatRate: 7 })),
  getOrCreateCompanySettings: vi.fn(async () => ({
    isVatRegistered,
    stockDeficitPolicy,
  })),
}));

import { prisma } from "@/lib/prisma";
import { checkout } from "./checkout";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "cashier-1",
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

// Simplified single-ingredient menu (no variant/modifier) — cost cascade math
// itself is already covered exactly against the reference dataset in
// lib/cost-formulas.test.ts; this test is about checkout()'s transactional
// wiring (tax invoice numbering, stock deficit policy), not re-deriving cost.
const menuFixture = {
  id: "menu-1",
  recipeId: "recipe-1",
  basePrice: 35,
  recipe: {
    id: "recipe-1",
    yield: 1,
    ingredients: [{ ingredientId: "ing-tea", quantity: 20 }],
  },
  variants: [],
  modifierGroups: [],
};

const recipeFixture = {
  id: "recipe-1",
  yield: 1,
  ingredients: [{ quantity: 20, ingredient: { costPerUnit: 0.475 } }],
};

const ingredientFixture = {
  id: "ing-tea",
  name: "ผงชาไทย",
  currentStockQty: 100,
  stockDeficitPolicyOverride: null,
};

function baseCheckoutInput() {
  return {
    items: [{ menuId: "menu-1", modifierIds: [], quantity: 1, lineDiscountAmount: 0 }],
    billDiscountAmount: 0,
    paymentMethod: "cash" as const,
  };
}

describe("checkout", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    isVatRegistered = false;
    stockDeficitPolicy = "warn_only";

    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);
    prismaMock.menu.findUnique.mockResolvedValue(menuFixture as never);
    prismaMock.recipe.findUniqueOrThrow.mockResolvedValue(recipeFixture as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
    prismaMock.salesTransaction.create.mockResolvedValue({ id: "sale-1" } as never);
    prismaMock.salesTransactionItem.create.mockResolvedValue({ id: "item-1" } as never);
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(ingredientFixture as never);
    prismaMock.inventoryMovement.create.mockResolvedValue({} as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);
  });

  it("D16: does not consume a tax invoice number when the shop is not VAT-registered", async () => {
    isVatRegistered = false;

    const result = await checkout(baseCheckoutInput());

    expect(result.success).toBe(true);
    expect(prismaMock.salesTransaction.aggregate).not.toHaveBeenCalled();
    expect(prismaMock.salesTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taxInvoiceNumber: null }) }),
    );
  });

  it("D16: assigns the next continuous tax invoice number when VAT-registered", async () => {
    isVatRegistered = true;
    prismaMock.salesTransaction.aggregate.mockResolvedValue({
      _max: { taxInvoiceNumber: 5 },
    } as never);

    const result = await checkout(baseCheckoutInput());

    expect(result.success).toBe(true);
    expect(prismaMock.salesTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taxInvoiceNumber: 6 }) }),
    );
  });

  it("TC-DEF-01: warn-only (default) sells through an insufficient-stock item and flags is_stock_deficit", async () => {
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      ...ingredientFixture,
      currentStockQty: 5,
    } as never);

    const result = await checkout(baseCheckoutInput());

    expect(result.success).toBe(true);
    expect(result.isStockDeficit).toBe(true);
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isStockDeficit: true, quantity: 20 }),
      }),
    );
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-tea" },
      data: { currentStockQty: { decrement: 20 } },
    });
  });

  it("D4: strict_block (global) refuses to sell an item that would push stock negative", async () => {
    stockDeficitPolicy = "strict_block";
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      ...ingredientFixture,
      currentStockQty: 5,
    } as never);

    const result = await checkout(baseCheckoutInput());

    expect(result.error).toBeTruthy();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("does not flag a deficit or touch the policy when stock is sufficient", async () => {
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      ...ingredientFixture,
      currentStockQty: 100,
    } as never);

    const result = await checkout(baseCheckoutInput());

    expect(result.success).toBe(true);
    expect(result.isStockDeficit).toBe(false);
  });
});
