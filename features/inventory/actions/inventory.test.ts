import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §3 TC-DEF-01 / DECISIONS.md D4 (warn-only default, opt-in strict
// block) and D12 (reason_code must be a real, active, DB-managed code).
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

let companyStockDeficitPolicy: "warn_only" | "strict_block" = "warn_only";
vi.mock("@/lib/settings", () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({
    stockDeficitPolicy: companyStockDeficitPolicy,
  })),
}));

import { prisma } from "@/lib/prisma";
import { recordStockOut } from "./inventory";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "employee-1",
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

// TESTING.md §2.1 TC-DEF-01: ไข่มุกเหลือ 20g, ต้องใช้ 30g -> ขายต่อได้
// (warn-only ค่าเริ่มต้น), สต็อกเหลือ -10g, is_stock_deficit = true
const pearlIngredient = {
  id: "ing-pearl",
  name: "ไข่มุก",
  baseUnit: "gram",
  costPerUnit: 0.07,
  currentStockQty: 20,
  lowStockThreshold: null,
  stockDeficitPolicyOverride: null,
  supplierId: null,
  deletedAt: null,
  createdAt: new Date(),
  createdBy: "owner-1",
  updatedAt: new Date(),
  updatedBy: null,
};

describe("recordStockOut", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    companyStockDeficitPolicy = "warn_only";
    getUser.mockResolvedValue({ data: { user: { id: "employee-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(actorRow("employee") as never);
    prismaMock.reasonCode.findFirst.mockResolvedValue({
      id: "rc-1",
      code: "spoiled",
      label: "ของเสีย/หมดอายุ",
      isActive: true,
    } as never);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "mv-1" } as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);
  });

  it("TC-DEF-01: warn-only (default) lets the stock-out through and flags is_stock_deficit, going negative", async () => {
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(pearlIngredient as never);

    const result = await recordStockOut({
      ingredientId: "ing-pearl",
      quantity: 30,
      reasonCode: "spoiled",
    });

    expect(result.success).toBe(true);
    expect(result.isStockDeficit).toBe(true);
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isStockDeficit: true, quantity: 30 }),
      }),
    );
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-pearl" },
      data: { currentStockQty: { decrement: 30 } },
    });
  });

  it("D4: strict_block (global) rejects a stock-out that would go negative", async () => {
    companyStockDeficitPolicy = "strict_block";
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(pearlIngredient as never);

    const result = await recordStockOut({
      ingredientId: "ing-pearl",
      quantity: 30,
      reasonCode: "spoiled",
    });

    expect(result.error).toBeTruthy();
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it("D4: a per-ingredient strict_block override rejects even when the shop-wide default is warn_only", async () => {
    companyStockDeficitPolicy = "warn_only";
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      ...pearlIngredient,
      stockDeficitPolicyOverride: "strict_block",
    } as never);

    const result = await recordStockOut({
      ingredientId: "ing-pearl",
      quantity: 30,
      reasonCode: "spoiled",
    });

    expect(result.error).toBeTruthy();
    expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("strict_block never blocks a stock-out that does NOT cause a deficit", async () => {
    companyStockDeficitPolicy = "strict_block";
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      ...pearlIngredient,
      currentStockQty: 100,
    } as never);

    const result = await recordStockOut({
      ingredientId: "ing-pearl",
      quantity: 30,
      reasonCode: "spoiled",
    });

    expect(result.success).toBe(true);
    expect(result.isStockDeficit).toBe(false);
  });

  it("D12/FR-SET-05: rejects a reason code that isn't a real, active, DB-managed code", async () => {
    prismaMock.reasonCode.findFirst.mockResolvedValue(null); // not found / inactive / deleted

    const result = await recordStockOut({
      ingredientId: "ing-pearl",
      quantity: 5,
      reasonCode: "made_up_reason",
    });

    expect(result.error).toBeTruthy();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
