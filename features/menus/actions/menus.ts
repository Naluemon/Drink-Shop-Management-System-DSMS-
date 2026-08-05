"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
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

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "menu_category",
    entityId: category.id,
    entityName: category.name,
    changes: snapshotFields(category, ["name", "type"]),
  });

  return { success: true, category };
}

export async function updateMenuCategory(id: string, input: MenuCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขหมวดหมู่") };
  }

  const result = menuCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.menuCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่" };

  const existingCategory = await prisma.menuCategory.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  await prisma.menuCategory.update({
    where: { id },
    data: { name: result.data.name, type: result.data.type, updatedBy: actor.id },
  });

  const changes = diffFields(current, { name: result.data.name, type: result.data.type }, [
    "name",
    "type",
  ]);
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu_category",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

// Soft-delete only (same reasoning as softDeleteMenu) — menus keep pointing
// at the deleted category's id, they just stop offering it going forward
// (Menu.categoryId is nullable, so nothing breaks for menus already using it).
export async function softDeleteMenuCategory(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบหมวดหมู่") };
  }

  const current = await prisma.menuCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่" };

  await prisma.menuCategory.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu_category",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
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

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "menu",
    entityId: menu.id,
    entityName: menu.name,
    changes: snapshotFields({ ...menu, basePrice: menu.basePrice.toString() }, [
      "name",
      "recipeId",
      "categoryId",
      "basePrice",
      "isAvailable",
    ]),
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

  const changes = diffFields(
    { ...current, basePrice: current.basePrice.toString() },
    {
      name: result.data.name,
      recipeId: result.data.recipeId,
      categoryId: result.data.categoryId || null,
      basePrice: result.data.basePrice.toString(),
      isAvailable: result.data.isAvailable,
    },
    ["name", "recipeId", "categoryId", "basePrice", "isAvailable"],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

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

  const current = await prisma.menu.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบเมนู" };

  await prisma.menu.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu",
    entityId: id,
    entityName: current.name,
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

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) return { error: "ไม่พบเมนู" };

  const variant = await prisma.$transaction(async (tx) => {
    if (result.data.isDefault) {
      await tx.menuVariant.updateMany({ where: { menuId }, data: { isDefault: false } });
    }
    const created = await tx.menuVariant.create({
      data: {
        menuId,
        name: result.data.name,
        recipeMultiplier: result.data.mode === "multiplier" ? result.data.recipeMultiplier : null,
        overrideRecipeId: result.data.mode === "override" ? result.data.overrideRecipeId : null,
        priceDelta: result.data.priceDelta,
        isDefault: result.data.isDefault,
      },
    });
    await recordAuditLog(tx, {
      branchId: menu.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "created",
      entityType: "menu_variant",
      entityId: created.id,
      entityName: `${menu.name} — ${created.name}`,
      changes: snapshotFields({ ...created, priceDelta: created.priceDelta.toString() }, [
        "name",
        "priceDelta",
        "isDefault",
      ]),
    });
    return created;
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

  const current = await prisma.menuVariant.findUnique({
    where: { id },
    include: { menu: true },
  });
  if (!current) return { error: "ไม่พบตัวเลือกขนาด" };

  await prisma.menuVariant.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAuditLog(prisma, {
    branchId: current.menu.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "menu_variant",
    entityId: id,
    entityName: `${current.menu.name} — ${current.name}`,
  });

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

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) return { error: "ไม่พบเมนู" };

  await prisma.$transaction(async (tx) => {
    await tx.menuModifierGroup.deleteMany({ where: { menuId } });
    await tx.menuModifierGroup.createMany({
      data: modifierGroupIds.map((modifierGroupId) => ({ menuId, modifierGroupId })),
    });
    await recordAuditLog(tx, {
      branchId: menu.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "menu",
      entityId: menuId,
      entityName: menu.name,
      changes: [
        {
          field: "modifierGroupIds",
          oldValue: null,
          newValue: modifierGroupIds.join(", ") || null,
        },
      ],
    });
  });

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
