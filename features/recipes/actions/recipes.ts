"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import {
  recipeSchema,
  RecipeInput,
  recipeIngredientSchema,
  RecipeIngredientInput,
} from "../schemas/recipe.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// FR-RCP-01/02/03: list พร้อม cost คำนวณสด (ไม่ cache — ARCHITECTURE.md §3)
export async function listRecipes() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสูตร") };
  }

  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null },
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { name: "asc" },
  });

  return {
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      yield: r.yield.toString(),
      cost:
        r.ingredients.reduce(
          (sum, ri) => sum + Number(ri.quantity) * Number(ri.ingredient.costPerUnit),
          0,
        ) / Number(r.yield),
      ingredients: r.ingredients.map((ri) => ({
        id: ri.id,
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        baseUnit: ri.ingredient.baseUnit,
        quantity: ri.quantity.toString(),
      })),
    })),
  };
}

export async function createRecipe(input: RecipeInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างสูตร") };
  }

  const result = recipeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existing = await prisma.recipe.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีสูตรชื่อนี้อยู่แล้ว" };

  const recipe = await prisma.recipe.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      yield: result.data.yield,
      createdBy: actor.id,
    },
  });

  return { success: true, recipe };
}

export async function updateRecipe(id: string, input: RecipeInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  const result = recipeSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.recipe.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบสูตร" };

  const existing = await prisma.recipe.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีสูตรชื่อนี้อยู่แล้ว" };

  await prisma.recipe.update({
    where: { id },
    data: { name: result.data.name, yield: result.data.yield, updatedBy: actor.id },
  });

  return { success: true };
}

// FR-... master data ลบแบบ soft-delete เท่านั้น (DATABASE.md §4)
export async function softDeleteRecipe(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบสูตร") };
  }

  await prisma.recipe.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  return { success: true };
}

export async function addRecipeIngredient(recipeId: string, input: RecipeIngredientInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  const result = recipeIngredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: result.data.ingredientId },
  });
  if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

  const recipeIngredient = await prisma.recipeIngredient.create({
    data: {
      recipeId,
      ingredientId: result.data.ingredientId,
      quantity: result.data.quantity,
    },
  });

  return {
    success: true,
    recipeIngredient: {
      id: recipeIngredient.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      baseUnit: ingredient.baseUnit,
      quantity: recipeIngredient.quantity.toString(),
    },
  };
}

export async function removeRecipeIngredient(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "recipe");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขสูตร") };
  }

  await prisma.recipeIngredient.delete({ where: { id } });
  return { success: true };
}

// เผื่อใช้ยืนยัน live recalculation (FR-RCP-04) จาก UI จุดเดียว
export async function getRecipeCost(recipeId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  const cost = await calculateRecipeCost(recipeId);
  return { cost };
}
