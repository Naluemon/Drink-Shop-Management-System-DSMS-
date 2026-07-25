// DECISIONS.md D9: VAT, discount, and rounding math for POS. Kept separate
// from lib/cost-formulas.ts (ingredient->recipe->menu cost cascade) — this
// file is about price/tax, not cost.

export type VatMode = "inclusive" | "exclusive" | "none";

// D9: default vat_mode is inclusive (prices already include VAT, Thai retail
// norm) — extract the VAT portion rather than adding it on top. Exclusive
// mode adds VAT on top instead. "none" means the shop isn't charging VAT.
export function computeVatAmount(amount: number, vatRate: number, vatMode: VatMode): number {
  if (vatMode === "none") return 0;
  if (vatMode === "inclusive") return (amount * vatRate) / (100 + vatRate);
  return (amount * vatRate) / 100;
}

// The customer-facing total for a given subtotal: exclusive mode adds VAT on
// top; inclusive/none both leave the subtotal as-is (VAT, if any, is already
// baked in for inclusive; there is none to add for "none").
export function computeTotalWithVat(subtotal: number, vatRate: number, vatMode: VatMode): number {
  if (vatMode === "exclusive") return subtotal + computeVatAmount(subtotal, vatRate, vatMode);
  return subtotal;
}

// DECISIONS.md D9: round the grand total to whole baht using round-half-up
// (0.50 and above rounds up — Thai retail convention, no circulating satang
// in cash transactions), recording the difference separately rather than
// folding it into any menu price.
export function roundToWholeBaht(amount: number): { rounded: number; adjustment: number } {
  const rounded = Math.floor(amount + 0.5);
  return { rounded, adjustment: Math.round((rounded - amount) * 100) / 100 };
}
