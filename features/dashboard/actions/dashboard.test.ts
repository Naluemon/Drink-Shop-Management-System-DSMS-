import { describe, it, expect, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/settings", () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({
    timezone: "Asia/Bangkok",
    businessDayStartHour: 5,
  })),
}));

import { prisma } from "@/lib/prisma";
import { getDashboardTrend, getDashboardData } from "./dashboard";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow() {
  return {
    id: "owner-1",
    email: "owner@shop.com",
    fullName: "Owner",
    role: "owner",
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Shape returned by dashboard.ts's fetchTransactionAggregates() raw query —
// one row per transaction with cogs already summed across its items in SQL.
function tx(overrides: { createdAt: Date; totalAmount: number; reversalOfId?: string | null }) {
  return {
    totalAmount: overrides.totalAmount,
    reversalOfId: overrides.reversalOfId ?? null,
    createdAt: overrides.createdAt,
    cogs: 10,
  };
}

describe("getDashboardTrend", () => {
  it("nets a same-bucket void to zero (7d, daily buckets)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(actorRow());

    const now = new Date();
    prismaMock.$queryRaw.mockResolvedValue([
      tx({ createdAt: now, totalAmount: 100 }),
      tx({ createdAt: now, totalAmount: 100, reversalOfId: "orig" }),
    ] as never);
    prismaMock.expenseEntry.findMany.mockResolvedValue([] as never);

    const result = await getDashboardTrend("7d");
    if ("error" in result) throw new Error(result.error);

    const total = result.trend.reduce((sum, p) => sum + p.revenue, 0);
    expect(total).toBe(0);
  });

  it("buckets a transaction from 2 months ago into the correct monthly bucket (12m)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(actorRow());

    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    prismaMock.$queryRaw.mockResolvedValue([
      tx({ createdAt: twoMonthsAgo, totalAmount: 500 }),
    ] as never);
    prismaMock.expenseEntry.findMany.mockResolvedValue([] as never);

    const result = await getDashboardTrend("12m");
    if ("error" in result) throw new Error(result.error);

    expect(result.trend).toHaveLength(12);
    const expectedBucket = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
    const bucket = result.trend.find((p) => p.date === expectedBucket);
    expect(bucket?.revenue).toBe(500);

    const othersTotal = result.trend
      .filter((p) => p.date !== expectedBucket)
      .reduce((sum, p) => sum + p.revenue, 0);
    expect(othersTotal).toBe(0);
  });

  it("rejects an invalid range", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(actorRow());

    const result = await getDashboardTrend("invalid" as never);
    expect("error" in result).toBe(true);
  });
});

// groupBy()'s generic overloaded signature (select/take/orderBy variants)
// doesn't structurally match Jest's mock function type, unlike the simpler
// findMany/findUnique methods above — cast through unknown same as those do.
function mockInventoryMovementGroupBy(
  rows: { ingredientId: string; _sum: { quantity: number } }[],
) {
  (prismaMock.inventoryMovement.groupBy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    rows,
  );
}

function ingredientRow(overrides: {
  id: string;
  name: string;
  currentStockQty: number;
  lowStockThreshold?: number | null;
  openedAt?: Date | null;
  shelfLifeDaysAfterOpening?: number | null;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    baseUnit: "gram",
    costPerUnit: 1,
    currentStockQty: overrides.currentStockQty,
    lowStockThreshold: overrides.lowStockThreshold ?? null,
    openedAt: overrides.openedAt ?? null,
    shelfLifeDaysAfterOpening: overrides.shelfLifeDaysAfterOpening ?? null,
    supplierId: null,
    deletedAt: null,
  };
}

// getIngredientOverview() estimates "days remaining" from stock_out volume
// over the last 14 days — a real usage-rate signal, distinct from the fixed
// lowStockThreshold LowStockBanner already covers.
describe("getDashboardData — runningOutSoon", () => {
  function stubCommonQueries() {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(actorRow());
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    prismaMock.expenseEntry.findMany.mockResolvedValue([] as never);
    prismaMock.salesTransaction.findMany.mockResolvedValue([] as never);
  }

  it("estimates days remaining from 14-day stock_out volume and flags it inside the 7-day window", async () => {
    stubCommonQueries();
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({ id: "ing-1", name: "นมสด", currentStockQty: 700 }),
    ] as never);
    // 14-day total of 1400 -> 100/day average -> 700 / 100 = 7 days remaining
    mockInventoryMovementGroupBy([{ ingredientId: "ing-1", _sum: { quantity: 1400 } }]);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.runningOutSoon).toEqual([
      expect.objectContaining({ name: "นมสด", daysRemaining: 7 }),
    ]);
  });

  it("excludes an ingredient whose usage rate puts it beyond the 7-day window", async () => {
    stubCommonQueries();
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({ id: "ing-1", name: "น้ำตาล", currentStockQty: 10_000 }),
    ] as never);
    // 100/day average -> 100 days remaining, well outside the window
    mockInventoryMovementGroupBy([{ ingredientId: "ing-1", _sum: { quantity: 1400 } }]);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.runningOutSoon).toEqual([]);
  });

  it("skips an ingredient with no stock_out history at all (no usage-rate signal to estimate from)", async () => {
    stubCommonQueries();
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({ id: "ing-1", name: "ไม่มีคนใช้เลย", currentStockQty: 1 }),
    ] as never);
    mockInventoryMovementGroupBy([]);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.runningOutSoon).toEqual([]);
  });

  it("sorts multiple flagged ingredients soonest-first", async () => {
    stubCommonQueries();
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({ id: "ing-slower", name: "ช้ากว่า", currentStockQty: 600 }), // 6 days
      ingredientRow({ id: "ing-faster", name: "เร็วกว่า", currentStockQty: 200 }), // 2 days
    ] as never);
    mockInventoryMovementGroupBy([
      { ingredientId: "ing-slower", _sum: { quantity: 1400 } }, // 100/day
      { ingredientId: "ing-faster", _sum: { quantity: 1400 } }, // 100/day
    ]);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.runningOutSoon?.map((r) => r.name)).toEqual(["เร็วกว่า", "ช้ากว่า"]);
  });
});

// getIngredientOverview() also flags ingredients by shelf-life-after-opening
// (features/ingredients' markIngredientOpened()/clearIngredientOpened()) —
// a separate freshness signal from runningOutSoon's stock-depletion estimate.
describe("getDashboardData — expiringSoon", () => {
  function stubCommonQueries() {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(actorRow());
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    prismaMock.expenseEntry.findMany.mockResolvedValue([] as never);
    prismaMock.salesTransaction.findMany.mockResolvedValue([] as never);
    mockInventoryMovementGroupBy([]);
  }

  it("flags an ingredient opened long enough ago to be within the 3-day window", async () => {
    stubCommonQueries();
    const openedAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000); // opened 6 days ago
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({
        id: "ing-1",
        name: "ผงชาไทย",
        currentStockQty: 500,
        shelfLifeDaysAfterOpening: 7, // expires 1 day from now
        openedAt,
      }),
    ] as never);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.expiringSoon).toEqual([
      expect.objectContaining({ name: "ผงชาไทย", daysRemaining: 1 }),
    ]);
  });

  it("reports a negative daysRemaining once already past its shelf life", async () => {
    stubCommonQueries();
    const openedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // opened 10 days ago
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({
        id: "ing-1",
        name: "ผงชาไทย",
        currentStockQty: 500,
        shelfLifeDaysAfterOpening: 7, // expired 3 days ago
        openedAt,
      }),
    ] as never);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.expiringSoon).toEqual([
      expect.objectContaining({ name: "ผงชาไทย", daysRemaining: -3 }),
    ]);
  });

  it("excludes an ingredient opened too recently to be within the window", async () => {
    stubCommonQueries();
    const openedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // opened yesterday
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({
        id: "ing-1",
        name: "ผงชาไทย",
        currentStockQty: 500,
        shelfLifeDaysAfterOpening: 7, // 6 days still left
        openedAt,
      }),
    ] as never);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.expiringSoon).toEqual([]);
  });

  it("excludes an ingredient that isn't opened, even with shelfLifeDaysAfterOpening configured", async () => {
    stubCommonQueries();
    prismaMock.ingredient.findMany.mockResolvedValue([
      ingredientRow({
        id: "ing-1",
        name: "ผงชาไทย",
        currentStockQty: 500,
        shelfLifeDaysAfterOpening: 7,
        openedAt: null,
      }),
    ] as never);

    const result = await getDashboardData();
    if ("error" in result) throw new Error(result.error);

    expect(result.expiringSoon).toEqual([]);
  });
});
