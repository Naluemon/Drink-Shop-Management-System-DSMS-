"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import { computeVariantCost, computeModifierCost } from "@/lib/cost-formulas";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

// FR-POS-01/02/06: menu grid data for the register screen — includes
// pre-computed cost/price per variant and modifier so the client can show a
// live cart total without hitting the server on every tap. The actual
// checkout() call independently recomputes everything server-side; this data
// is for display only and is never trusted as the charge amount.
export async function getPosMenuData() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "pos_sale");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ใช้งานหน้าขาย" };
    throw e;
  }

  const menus = await prisma.menu.findMany({
    where: { deletedAt: null, isAvailable: true },
    include: {
      category: true,
      recipe: { include: { ingredients: { include: { ingredient: true } } } },
      variants: { where: { deletedAt: null } },
      modifierGroups: {
        include: {
          modifierGroup: {
            include: { modifiers: { where: { deletedAt: null }, include: { ingredient: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const menusWithCost = await Promise.all(
    menus.map(async (m) => {
      const mainRecipeCost = await calculateRecipeCost(m.recipeId);

      const variants = await Promise.all(
        m.variants.map(async (v) => {
          const overrideRecipeCost = v.overrideRecipeId
            ? await calculateRecipeCost(v.overrideRecipeId)
            : null;
          const cost = computeVariantCost(mainRecipeCost, {
            recipeMultiplier: v.recipeMultiplier ? Number(v.recipeMultiplier) : null,
            overrideRecipeCost,
          });
          return {
            id: v.id,
            name: v.name,
            priceDelta: v.priceDelta.toString(),
            isDefault: v.isDefault,
            cost,
          };
        }),
      );

      const modifierGroups = m.modifierGroups.map((mg) => ({
        id: mg.modifierGroup.id,
        name: mg.modifierGroup.name,
        selectionType: mg.modifierGroup.selectionType,
        isRequired: mg.modifierGroup.isRequired,
        modifiers: mg.modifierGroup.modifiers.map((mod) => ({
          id: mod.id,
          name: mod.name,
          priceDelta: mod.priceDelta.toString(),
          cost: computeModifierCost({
            ingredientQuantity: mod.ingredientQuantity ? Number(mod.ingredientQuantity) : null,
            ingredientCostPerUnit: mod.ingredient ? Number(mod.ingredient.costPerUnit) : null,
          }),
        })),
      }));

      return {
        id: m.id,
        name: m.name,
        basePrice: m.basePrice.toString(),
        imageUrl: m.imageUrl,
        categoryName: m.category?.name ?? null,
        categoryType: m.category?.type ?? "drink",
        mainRecipeCost,
        variants,
        modifierGroups,
      };
    }),
  );

  return { menus: menusWithCost };
}
