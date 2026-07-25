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
import { getDashboardTrend } from "./dashboard";

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
