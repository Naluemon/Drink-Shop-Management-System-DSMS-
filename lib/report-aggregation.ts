// Phase 11 — Reports. Pure aggregation math, kept separate from the
// Prisma-fetching server actions (same split as cost-formulas.ts/cost-cascade.ts
// and lib/money-formulas.ts) so FR-RPT-05's "numbers traceable to the ledger"
// guarantee has a direct unit test, independent of the database.

export interface SaleLine {
  totalAmount: number;
  itemCost: number;
  isReversal: boolean;
}

export interface SalesAggregate {
  transactionCount: number;
  revenue: number;
  cogs: number;
  profit: number;
}

// Reversal rows (void/refund) store the SAME positive totalAmount/cost as the
// original sale — the sign is implied by isReversal, not the stored value
// (mirrors inventory_movements' "reversal" type convention).
export function aggregateSales(lines: SaleLine[]): SalesAggregate {
  let revenue = 0;
  let cogs = 0;
  let transactionCount = 0;
  for (const l of lines) {
    const sign = l.isReversal ? -1 : 1;
    revenue += sign * l.totalAmount;
    cogs += sign * l.itemCost;
    if (!l.isReversal) transactionCount += 1;
  }
  return { transactionCount, revenue, cogs, profit: revenue - cogs };
}

// Expense entries already store corrections as signed deltas (FR-EXP-03) —
// summing raw amounts nets out any adjustment/reversal automatically.
export function sumExpenseAmounts(amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + a, 0);
}
