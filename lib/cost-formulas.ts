// Pure cost-cascade math only — no imports of lib/prisma or anything
// server-only. This file is safe to import from Client Components (e.g. a
// live cost preview while editing a menu/variant/modifier combination,
// FR-MENU-06) as well as from server code. lib/cost-cascade.ts wraps these
// with the actual DB fetches and must stay server-only.

// ARCHITECTURE.md §3 (Cost Cascade): this is the ONLY place recipe cost is
// computed — Menu/Variant (Phase 5) and the POS cost snapshot (Phase 8) must
// call this (or its variant/modifier extension), never re-implement the sum.
// There is no persisted "cost" column on Recipe (schema.prisma) — cost is
// always computed live from current ingredient.cost_per_unit, which is what
// makes FR-RCP-04 (recalculate the instant an ingredient's cost changes,
// no manual trigger) trivially true: there is nothing to invalidate.
export function computeRecipeCost(
  ingredients: { quantity: number; costPerUnit: number }[],
  yieldAmount: number,
): number {
  const totalCost = ingredients.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0);
  return totalCost / yieldAmount;
}

// DECISIONS.md D3 / ARCHITECTURE.md §3: a variant either multiplies the
// menu's main recipe cost, or (if override_recipe_id is set) uses a whole
// separate recipe's cost instead — never both.
export function computeVariantCost(
  mainRecipeCost: number,
  variant: { recipeMultiplier: number | null; overrideRecipeCost: number | null },
): number {
  if (variant.overrideRecipeCost !== null) return variant.overrideRecipeCost;
  return mainRecipeCost * (variant.recipeMultiplier ?? 1);
}

// A modifier only adds cost if it's bound to an ingredient (e.g. ไข่มุก) —
// modifiers with no ingredient_id (e.g. a sweetness level) add zero cost.
export function computeModifierCost(modifier: {
  ingredientQuantity: number | null;
  ingredientCostPerUnit: number | null;
}): number {
  if (modifier.ingredientQuantity == null || modifier.ingredientCostPerUnit == null) return 0;
  return modifier.ingredientQuantity * modifier.ingredientCostPerUnit;
}

// ARCHITECTURE.md §3: "ยอดต้นทุนต่อรายการขาย = recipe_cost × variant_multiplier
// + Σ(modifier costs ที่เลือก)" — the ONE formula for a sale line's cost.
// POS (Phase 8) must call this for its cost snapshot, never re-derive it.
export function computeSaleItemCost(variantCost: number, modifierCosts: number[]): number {
  return variantCost + modifierCosts.reduce((sum, c) => sum + c, 0);
}

// DECISIONS.md D1 (Weighted Average Cost): all quantities/costs here are in
// the ingredient's base_unit — convert purchase_unit -> base_unit (via
// unit_conversions.conversion_factor) BEFORE calling this. Every receive
// event recalculates the running average; there is no separate "recompute"
// step (FR-PUR-03: cost_per_unit updates the instant a PO is received).
export function computeWeightedAverageCost(
  oldQtyBase: number,
  oldCostPerUnitBase: number,
  receivedQtyBase: number,
  receivedTotalCost: number,
): number {
  const totalQty = oldQtyBase + receivedQtyBase;
  if (totalQty <= 0) return oldCostPerUnitBase;
  return (oldQtyBase * oldCostPerUnitBase + receivedTotalCost) / totalQty;
}
