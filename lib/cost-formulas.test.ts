import { describe, it, expect } from "vitest";
import {
  computeRecipeCost,
  computeVariantCost,
  computeModifierCost,
  computeSaleItemCost,
  computeWeightedAverageCost,
} from "./cost-formulas";

// TESTING.md §2.2/§3: Recipe "ชาไทยเย็น", yield 1 แก้ว, Size M
const THAI_TEA_INGREDIENTS = [
  { quantity: 20, costPerUnit: 0.475 }, // ผงชาไทย
  { quantity: 60, costPerUnit: 0.0555 }, // นมสด UHT
  { quantity: 30, costPerUnit: 0.0533 }, // น้ำเชื่อม
  { quantity: 1, costPerUnit: 1.8 }, // แก้ว+ฝา+หลอด
];

describe("computeRecipeCost", () => {
  // TC-COST-01
  it("matches the reference dataset total (16.23 baht ±0.01)", () => {
    const cost = computeRecipeCost(THAI_TEA_INGREDIENTS, 1);
    expect(cost).toBeCloseTo(16.23, 2);
  });

  // TC-COST-02: ราคาผงชาไทยขึ้นจาก 0.4750 -> 0.5000 บาท/g
  it("recalculates immediately when an ingredient's cost changes (16.23 -> 16.73)", () => {
    const updated = THAI_TEA_INGREDIENTS.map((i) =>
      i.costPerUnit === 0.475 ? { ...i, costPerUnit: 0.5 } : i,
    );
    const cost = computeRecipeCost(updated, 1);
    expect(cost).toBeCloseTo(16.73, 2);
  });

  // FR-RCP-02/03: yield divides the total batch cost
  it("divides total cost by yield", () => {
    const cost = computeRecipeCost([{ quantity: 100, costPerUnit: 1 }], 4);
    expect(cost).toBe(25);
  });

  it("returns 0 for a recipe with no ingredients", () => {
    expect(computeRecipeCost([], 1)).toBe(0);
  });
});

// TESTING.md §2.3 / DECISIONS.md D3 — NOTE: the reference dataset's worked
// example for Size S/L excludes the cup (a non-scaling packaging cost) from
// the multiplier and adds it back as a flat amount: cost = (14.43×0.8)+1.80.
// ARCHITECTURE.md §3's stated formula is the plain "recipe_cost ×
// variant_multiplier" with no such split — there is no schema concept of
// "this recipe ingredient doesn't scale with the multiplier" (RecipeIngredient
// has no such flag). These tests follow the literal ARCHITECTURE.md formula;
// flagged to the user as a doc conflict rather than guessed silently.
describe("computeVariantCost", () => {
  const mainRecipeCost = 16.23; // ชาไทยเย็น Size M

  it("uses override recipe cost when set, ignoring the multiplier", () => {
    const cost = computeVariantCost(mainRecipeCost, {
      recipeMultiplier: 0.8,
      overrideRecipeCost: 20,
    });
    expect(cost).toBe(20);
  });

  it("multiplies the full recipe cost when no override is set", () => {
    const cost = computeVariantCost(mainRecipeCost, {
      recipeMultiplier: 1.3,
      overrideRecipeCost: null,
    });
    expect(cost).toBeCloseTo(21.1, 2); // 16.23 * 1.3, differs from TESTING.md's 20.56
  });

  it("defaults the multiplier to 1 when neither is meaningfully set", () => {
    expect(
      computeVariantCost(mainRecipeCost, { recipeMultiplier: null, overrideRecipeCost: null }),
    ).toBe(mainRecipeCost);
  });
});

describe("computeModifierCost", () => {
  // TESTING.md §2.3: ไข่มุก quantity 30g × 0.07 บาท/g = 2.10 บาท
  it("matches the reference dataset for an ingredient-bound modifier (ไข่มุก)", () => {
    const cost = computeModifierCost({ ingredientQuantity: 30, ingredientCostPerUnit: 0.07 });
    expect(cost).toBeCloseTo(2.1, 2);
  });

  it("is zero for a modifier with no bound ingredient (e.g. a sweetness level)", () => {
    expect(computeModifierCost({ ingredientQuantity: null, ingredientCostPerUnit: null })).toBe(0);
  });
});

describe("computeSaleItemCost", () => {
  // TESTING.md TC-MOD-01: Size M (16.23) + ไข่มุก (2.10) = 18.33
  it("sums variant cost with all selected modifier costs", () => {
    const cost = computeSaleItemCost(16.23, [2.1]);
    expect(cost).toBeCloseTo(18.33, 2);
  });

  it("returns just the variant cost when no modifiers are selected", () => {
    expect(computeSaleItemCost(16.23, [])).toBe(16.23);
  });
});

// TESTING.md §2.1 TC-WAC-01: นมสด UHT รับเข้า 2 ล็อต (10 กล่อง@50.00, 10 กล่อง@55.00)
// -> WAC = 52.50 บาท/กล่อง -> 52.50 / 946 = 0.0555 บาท/ml (D1)
describe("computeWeightedAverageCost", () => {
  it("matches the reference dataset across two sequential receive events", () => {
    const conversionFactor = 946; // 1 กล่อง = 946 ml

    // lot 1: 10 กล่อง @ 50.00, starting from empty stock
    const afterLot1 = computeWeightedAverageCost(0, 0, 10 * conversionFactor, 10 * 50.0);

    // lot 2: 10 กล่อง @ 55.00
    const afterLot2 = computeWeightedAverageCost(
      10 * conversionFactor,
      afterLot1,
      10 * conversionFactor,
      10 * 55.0,
    );

    expect(afterLot2).toBeCloseTo(0.0555, 4);
    expect(afterLot2 * conversionFactor).toBeCloseTo(52.5, 2); // ต่อกล่อง
  });

  it("keeps the old cost when receiving zero quantity into zero stock", () => {
    expect(computeWeightedAverageCost(0, 5, 0, 0)).toBe(5);
  });

  it("uses only the new lot's unit cost when starting from empty stock", () => {
    expect(computeWeightedAverageCost(0, 0, 100, 500)).toBe(5);
  });
});
