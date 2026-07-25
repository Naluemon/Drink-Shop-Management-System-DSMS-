// DECISIONS.md D4 / FR-SET-04: default is warn-only (non-blocking, just flag
// is_stock_deficit) — Owner may opt a specific ingredient, or the whole shop,
// into "strict_block" via Settings. Shared by recordStockOut (Phase 6) and
// checkout (Phase 8) so both enforce the exact same rule.

export type StockDeficitPolicy = "warn_only" | "strict_block";

export function resolveStockDeficitPolicy(
  ingredientOverride: StockDeficitPolicy | null,
  globalPolicy: StockDeficitPolicy,
): StockDeficitPolicy {
  return ingredientOverride ?? globalPolicy;
}

// Thrown inside a $transaction callback to abort it when strict_block applies
// — callers must catch this specific class and translate it to a normal
// { error: string } action result instead of letting it bubble as a 500.
export class StockDeficitBlockedError extends Error {
  constructor(public ingredientName: string) {
    super(`Stock deficit blocked for ingredient: ${ingredientName}`);
    this.name = "StockDeficitBlockedError";
  }
}
