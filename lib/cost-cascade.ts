import { prisma } from "@/lib/prisma";
import {
  computeRecipeCost,
  computeVariantCost,
  computeModifierCost,
  computeSaleItemCost,
  computeWeightedAverageCost,
} from "@/lib/cost-formulas";

// Server-only DB-fetching wrappers around lib/cost-formulas.ts's pure math.
// Import cost-formulas.ts directly instead if you need this in a Client
// Component (e.g. a live preview) — this file pulls in lib/prisma.
export {
  computeRecipeCost,
  computeVariantCost,
  computeModifierCost,
  computeSaleItemCost,
  computeWeightedAverageCost,
};

export async function calculateRecipeCost(recipeId: string): Promise<number> {
  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    include: { ingredients: { include: { ingredient: true } } },
  });

  return computeRecipeCost(
    recipe.ingredients.map((ri) => ({
      quantity: Number(ri.quantity),
      costPerUnit: Number(ri.ingredient.costPerUnit),
    })),
    Number(recipe.yield),
  );
}

export async function calculateVariantCost(variantId: string): Promise<number> {
  const variant = await prisma.menuVariant.findUniqueOrThrow({
    where: { id: variantId },
    include: { menu: true },
  });

  const mainRecipeCost = await calculateRecipeCost(variant.menu.recipeId);
  const overrideRecipeCost = variant.overrideRecipeId
    ? await calculateRecipeCost(variant.overrideRecipeId)
    : null;

  return computeVariantCost(mainRecipeCost, {
    recipeMultiplier: variant.recipeMultiplier ? Number(variant.recipeMultiplier) : null,
    overrideRecipeCost,
  });
}

export async function calculateModifierCost(modifierId: string): Promise<number> {
  const modifier = await prisma.modifier.findUniqueOrThrow({
    where: { id: modifierId },
    include: { ingredient: true },
  });

  return computeModifierCost({
    ingredientQuantity: modifier.ingredientQuantity ? Number(modifier.ingredientQuantity) : null,
    ingredientCostPerUnit: modifier.ingredient ? Number(modifier.ingredient.costPerUnit) : null,
  });
}
