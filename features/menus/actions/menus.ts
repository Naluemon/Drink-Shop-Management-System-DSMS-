"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import {
  menuCategorySchema,
  MenuCategoryInput,
  menuSchema,
  MenuInput,
  menuVariantSchema,
  MenuVariantInput,
} from "../schemas/menu.schema";

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

export async function listMenuCategories() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  const categories = await prisma.menuCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return { categories };
}

export async function createMenuCategory(input: MenuCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างหมวดหมู่") };
  }

  const result = menuCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingCategory = await prisma.menuCategory.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  const category = await prisma.menuCategory.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      type: result.data.type,
      createdBy: actor.id,
    },
  });

  return { success: true, category };
}

// FR-MENU-01/02: list พร้อมต้นทุน recipe หลักคำนวณสด (ARCHITECTURE.md §3)
export async function listMenus() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูเมนู") };
  }

  const menus = await prisma.menu.findMany({
    where: { deletedAt: null },
    include: {
      category: true,
      recipe: true,
      variants: { where: { deletedAt: null } },
      modifierGroups: { include: { modifierGroup: true } },
    },
    orderBy: { name: "asc" },
  });

  const menusWithCost = await Promise.all(
    menus.map(async (m) => ({
      id: m.id,
      name: m.name,
      basePrice: m.basePrice.toString(),
      imageUrl: m.imageUrl,
      isAvailable: m.isAvailable,
      categoryId: m.categoryId,
      categoryName: m.category?.name ?? null,
      recipeId: m.recipeId,
      recipeName: m.recipe.name,
      recipeCost: await calculateRecipeCost(m.recipeId),
      variants: m.variants.map((v) => ({
        id: v.id,
        name: v.name,
        recipeMultiplier: v.recipeMultiplier?.toString() ?? null,
        overrideRecipeId: v.overrideRecipeId,
        priceDelta: v.priceDelta.toString(),
        isDefault: v.isDefault,
      })),
      modifierGroupIds: m.modifierGroups.map((mg) => mg.modifierGroupId),
    })),
  );

  return { menus: menusWithCost };
}

export async function createMenu(input: MenuInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingMenu = await prisma.menu.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

  const menu = await prisma.menu.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice,
      imageUrl: result.data.imageUrl || null,
      isAvailable: result.data.isAvailable,
      createdBy: actor.id,
    },
  });

  return { success: true, menu };
}

export async function updateMenu(id: string, input: MenuInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.menu.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเมนู" };

  const existingMenu = await prisma.menu.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingMenu) return { error: "มีเมนูชื่อนี้อยู่แล้ว" };

  await prisma.menu.update({
    where: { id },
    data: {
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice,
      imageUrl: result.data.imageUrl || null,
      isAvailable: result.data.isAvailable,
      updatedBy: actor.id,
    },
  });

  return { success: true };
}

// FR-MENU-07: ลบแบบ soft-delete เท่านั้น
export async function softDeleteMenu(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบเมนู") };
  }

  await prisma.menu.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  return { success: true };
}

// FR-MENU-03: menu_variant พร้อม recipe_multiplier หรือ override_recipe_id
export async function addMenuVariant(menuId: string, input: MenuVariantInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  const result = menuVariantSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const variant = await prisma.$transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx.menuVariant.updateMany({ where: { menuId }, data: { isDefault: false } });
    }
    return tx.menuVariant.create({
      data: {
        menuId,
        name: result.data.name,
        recipeMultiplier: result.data.mode === "multiplier" ? result.data.recipeMultiplier : null,
        overrideRecipeId: result.data.mode === "override" ? result.data.overrideRecipeId : null,
        priceDelta: result.data.priceDelta,
        isDefault: result.data.isDefault,
      },
    });
  });

  return {
    success: true,
    variant: {
      id: variant.id,
      name: variant.name,
      recipeMultiplier: variant.recipeMultiplier?.toString() ?? null,
      overrideRecipeId: variant.overrideRecipeId,
      priceDelta: variant.priceDelta.toString(),
      isDefault: variant.isDefault,
    },
  };
}

export async function removeMenuVariant(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  await prisma.menuVariant.update({ where: { id }, data: { deletedAt: new Date() } });
  return { success: true };
}

export async function setMenuModifierGroups(menuId: string, modifierGroupIds: string[]) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขเมนู") };
  }

  await prisma.$transaction([
    prisma.menuModifierGroup.deleteMany({ where: { menuId } }),
    prisma.menuModifierGroup.createMany({
      data: modifierGroupIds.map((modifierGroupId) => ({ menuId, modifierGroupId })),
    }),
  ]);

  return { success: true };
}

export async function getRecipeOptions() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return { recipes };
}
