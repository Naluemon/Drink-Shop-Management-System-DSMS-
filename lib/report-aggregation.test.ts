import { describe, it, expect } from "vitest";
import { aggregateSales, sumExpenseAmounts, type SaleLine } from "./report-aggregation";

describe("aggregateSales", () => {
  it("sums revenue/cogs/profit across original sales only", () => {
    const lines: SaleLine[] = [
      { totalAmount: 100, itemCost: 40, isReversal: false },
      { totalAmount: 60, itemCost: 20, isReversal: false },
    ];
    expect(aggregateSales(lines)).toEqual({
      transactionCount: 2,
      revenue: 160,
      cogs: 60,
      profit: 100,
    });
  });

  it("nets a same-bucket void to zero and excludes it from transactionCount", () => {
    const lines: SaleLine[] = [
      { totalAmount: 100, itemCost: 40, isReversal: false },
      { totalAmount: 100, itemCost: 40, isReversal: true }, // void of the row above
    ];
    expect(aggregateSales(lines)).toEqual({
      transactionCount: 1,
      revenue: 0,
      cogs: 0,
      profit: 0,
    });
  });

  it("lets a refund reduce whichever bucket it was actually processed in", () => {
    // Original sale happened in an earlier bucket (not included here), only
    // its refund reversal falls in this bucket.
    const lines: SaleLine[] = [{ totalAmount: 100, itemCost: 40, isReversal: true }];
    expect(aggregateSales(lines)).toEqual({
      transactionCount: 0,
      revenue: -100,
      cogs: -40,
      profit: -60,
    });
  });

  it("returns all zeros for an empty bucket", () => {
    expect(aggregateSales([])).toEqual({ transactionCount: 0, revenue: 0, cogs: 0, profit: 0 });
  });
});

describe("sumExpenseAmounts", () => {
  it("nets a correction against its original entry", () => {
    expect(sumExpenseAmounts([2300.5, -300.5])).toBe(2000);
  });

  it("sums plain entries", () => {
    expect(sumExpenseAmounts([15000, 2300.5])).toBe(17300.5);
  });
});
