"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import {
  modifierGroupSchema,
  ModifierGroupInput,
  modifierSchema,
  ModifierInput,
} from "../schemas/modifier.schema";

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

// FR-MENU-04/05: modifier_group + modifier — permission ผูกกับ resource "menu"
// (SECURITY.md §1 ไม่มีแถวแยกสำหรับ modifier group ระบุไว้ต่างหาก ใช้ร่วมกับ Menu)
export async function listModifierGroups() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูกลุ่มตัวเลือก") };
  }

  const groups = await prisma.modifierGroup.findMany({
    where: { deletedAt: null },
    include: { modifiers: { where: { deletedAt: null }, include: { ingredient: true } } },
    orderBy: { name: "asc" },
  });

  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      modifiers: g.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient?.name ?? null,
        ingredientQuantity: m.ingredientQuantity?.toString() ?? null,
        ingredientCostPerUnit: m.ingredient?.costPerUnit.toString() ?? null,
        priceDelta: m.priceDelta.toString(),
      })),
    })),
  };
}

export async function createModifierGroup(input: ModifierGroupInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch();

  const existingGroup = await prisma.modifierGroup.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

  const group = await prisma.modifierGroup.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      selectionType: result.data.selectionType,
      isRequired: result.data.isRequired,
    },
  });

  return { success: true, group };
}

export async function updateModifierGroup(id: string, input: ModifierGroupInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierGroupSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบกลุ่มตัวเลือก" };

  const existingGroup = await prisma.modifierGroup.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingGroup) return { error: "มีกลุ่มตัวเลือกชื่อนี้อยู่แล้ว" };

  await prisma.modifierGroup.update({
    where: { id },
    data: {
      name: result.data.name,
      selectionType: result.data.selectionType,
      isRequired: result.data.isRequired,
    },
  });

  return { success: true };
}

export async function softDeleteModifierGroup(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบกลุ่มตัวเลือก") };
  }

  await prisma.modifierGroup.update({ where: { id }, data: { deletedAt: new Date() } });
  return { success: true };
}

export async function addModifier(modifierGroupId: string, input: ModifierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  const result = modifierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const existingModifier = await prisma.modifier.findFirst({
    where: {
      modifierGroupId,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingModifier) return { error: "มีตัวเลือกชื่อนี้อยู่ในกลุ่มนี้แล้ว" };

  const modifier = await prisma.modifier.create({
    data: {
      modifierGroupId,
      name: result.data.name,
      ingredientId: result.data.ingredientId || null,
      ingredientQuantity: result.data.ingredientQuantity ?? null,
      priceDelta: result.data.priceDelta,
    },
    include: { ingredient: true },
  });

  return {
    success: true,
    modifier: {
      id: modifier.id,
      name: modifier.name,
      ingredientId: modifier.ingredientId,
      ingredientName: modifier.ingredient?.name ?? null,
      ingredientQuantity: modifier.ingredientQuantity?.toString() ?? null,
      ingredientCostPerUnit: modifier.ingredient?.costPerUnit.toString() ?? null,
      priceDelta: modifier.priceDelta.toString(),
    },
  };
}

export async function removeModifier(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "menu");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขกลุ่มตัวเลือก") };
  }

  await prisma.modifier.update({ where: { id }, data: { deletedAt: new Date() } });
  return { success: true };
}
