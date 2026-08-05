"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { recordStockIn } from "@/features/inventory/actions/inventory";
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
import {
  ingredientSchema,
  IngredientInput,
  unitConversionSchema,
  UnitConversionInput,
} from "../schemas/ingredient.schema";

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

// FR-ING-01: CRUD ingredient พร้อม Search/Filter ตามชื่อ/supplier
// (หมายเหตุ: REQUIREMENTS.md เขียนว่า filter ตาม "หมวดหมู่" ด้วย แต่ schema.prisma
// ไม่มีคอลัมน์ category ของ ingredient เลย — implement เท่าที่ schema รองรับจริง
// คือชื่อ+supplier ก่อน ส่วน category ต้อง confirm กับผู้ใช้ว่าจะเพิ่มคอลัมน์ใหม่ไหม)
export async function listIngredients(filters?: { search?: string; supplierId?: string }) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการวัตถุดิบ") };
  }

  // createIngredient already scopes writes to the actor's branch (DATABASE.md
  // §2) — this read side was missing the same scoping, so any organization
  // could see every other organization's ingredients.
  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const ingredients = await prisma.ingredient.findMany({
    where: {
      branchId: branch.id,
      deletedAt: null,
      ...(filters?.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
    },
    include: { supplier: true, unitConversions: true },
    orderBy: { name: "asc" },
  });

  return { ingredients };
}

export async function listSuppliers() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  // Same cross-tenant leak as listIngredients above — scope to the actor's
  // branch instead of returning every organization's suppliers.
  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const suppliers = await prisma.supplier.findMany({
    where: { branchId: branch.id, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return { suppliers };
}

export async function createIngredient(input: IngredientInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }

  const result = ingredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existing = await prisma.ingredient.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" };

  const ingredient = await prisma.ingredient.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      baseUnit: result.data.baseUnit,
      costPerUnit: result.data.costPerUnit,
      lowStockThreshold:
        result.data.lowStockThreshold === "" || result.data.lowStockThreshold === undefined
          ? null
          : result.data.lowStockThreshold,
      shelfLifeDaysAfterOpening:
        result.data.shelfLifeDaysAfterOpening === "" ||
        result.data.shelfLifeDaysAfterOpening === undefined
          ? null
          : result.data.shelfLifeDaysAfterOpening,
      supplierId: result.data.supplierId || null,
      createdBy: actor.id,
    },
  });

  const startingStock =
    result.data.startingStock === "" || result.data.startingStock === undefined
      ? 0
      : result.data.startingStock;
  let stockInError: string | undefined;
  if (startingStock > 0) {
    const stockInResult = await recordStockIn({
      ingredientId: ingredient.id,
      quantity: startingStock,
      note: "สต็อกเริ่มต้นตอนเพิ่มวัตถุดิบ",
    });
    if (!("success" in stockInResult)) {
      stockInError = stockInResult.error;
    }
  }

  const unitConversionErrors: string[] = [];
  for (const uc of result.data.unitConversions ?? []) {
    try {
      await prisma.unitConversion.create({
        data: {
          ingredientId: ingredient.id,
          purchaseUnitName: uc.purchaseUnitName,
          conversionFactor: uc.conversionFactor,
        },
      });
    } catch {
      unitConversionErrors.push(`เพิ่มหน่วยซื้อ "${uc.purchaseUnitName}" ไม่สำเร็จ`);
    }
  }

  // recordStockIn / unitConversion.create above wrote directly to the DB
  // rather than mutating the `ingredient` object from create() above — the
  // caller (and the list page's optimistic row) needs the up-to-date
  // currentStockQty/unitConversions, not the pre-write snapshot.
  const finalIngredient = await prisma.ingredient.findUniqueOrThrow({
    where: { id: ingredient.id },
    include: { unitConversions: true },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "ingredient",
    entityId: ingredient.id,
    entityName: finalIngredient.name,
    changes: snapshotFields(
      { ...finalIngredient, costPerUnit: finalIngredient.costPerUnit.toString() },
      [
        "name",
        "baseUnit",
        "costPerUnit",
        "lowStockThreshold",
        "shelfLifeDaysAfterOpening",
        "supplierId",
      ],
    ),
  });

  return {
    success: true,
    ingredient: finalIngredient,
    stockInError,
    unitConversionErrors: unitConversionErrors.length > 0 ? unitConversionErrors : undefined,
  };
}

export async function updateIngredient(id: string, input: IngredientInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = ingredientSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  const existing = await prisma.ingredient.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" };

  const updated = await prisma.ingredient.update({
    where: { id },
    data: {
      name: result.data.name,
      baseUnit: result.data.baseUnit,
      costPerUnit: result.data.costPerUnit,
      lowStockThreshold:
        result.data.lowStockThreshold === "" || result.data.lowStockThreshold === undefined
          ? null
          : result.data.lowStockThreshold,
      shelfLifeDaysAfterOpening:
        result.data.shelfLifeDaysAfterOpening === "" ||
        result.data.shelfLifeDaysAfterOpening === undefined
          ? null
          : result.data.shelfLifeDaysAfterOpening,
      supplierId: result.data.supplierId || null,
      updatedBy: actor.id,
    },
  });

  const changes = diffFields(
    { ...current, costPerUnit: current.costPerUnit.toString() },
    { ...updated, costPerUnit: updated.costPerUnit.toString() },
    [
      "name",
      "baseUnit",
      "costPerUnit",
      "lowStockThreshold",
      "shelfLifeDaysAfterOpening",
      "supplierId",
    ],
  );
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "ingredient",
      entityId: id,
      entityName: updated.name,
      changes,
    });
  }

  return { success: true };
}

// เปิดใช้วันนี้ — เริ่มนับอายุการใช้งานหลังเปิด (shelfLifeDaysAfterOpening วัน
// นับจากตอนนี้). เรียกซ้ำได้เรื่อยๆ ทุกครั้งที่เปิดของชิ้นใหม่ ค่าเก่าจะถูกเขียนทับ
export async function markIngredientOpened(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };
  if (!current.shelfLifeDaysAfterOpening) {
    return { error: "วัตถุดิบนี้ยังไม่ได้ตั้งค่าอายุการใช้งานหลังเปิด" };
  }

  const openedAt = new Date();
  await prisma.ingredient.update({
    where: { id },
    data: { openedAt, updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
    changes: diffFields({ openedAt: current.openedAt }, { openedAt }, ["openedAt"]),
  });

  return { success: true };
}

// ยกเลิกการนับอายุการใช้งาน — กรณีกดผิดหรืออยากเริ่มนับใหม่ทีหลัง
export async function clearIngredientOpened(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  await prisma.ingredient.update({
    where: { id },
    data: { openedAt: null, updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
    changes: diffFields({ openedAt: current.openedAt }, { openedAt: null }, ["openedAt"]),
  });

  return { success: true };
}

// FR-ING-07: ลบแบบ soft-delete เท่านั้น (DATABASE.md §4 — อาจถูกอ้างอิงจาก recipe/PO เก่า)
export async function softDeleteIngredient(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบวัตถุดิบ") };
  }

  const current = await prisma.ingredient.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบวัตถุดิบ" };

  await prisma.ingredient.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "ingredient",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}

// FR-ING-03: unit_conversions หลายรายการต่อ ingredient
export async function addUnitConversion(ingredientId: string, input: UnitConversionInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const result = unitConversionSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) return { error: "ไม่พบวัตถุดิบ" };

  const conversion = await prisma.unitConversion.create({
    data: {
      ingredientId,
      purchaseUnitName: result.data.purchaseUnitName,
      conversionFactor: result.data.conversionFactor,
    },
  });

  await recordAuditLog(prisma, {
    branchId: ingredient.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "unit_conversion",
    entityId: conversion.id,
    entityName: `${ingredient.name} — ${conversion.purchaseUnitName}`,
    changes: snapshotFields(
      {
        purchaseUnitName: conversion.purchaseUnitName,
        conversionFactor: conversion.conversionFactor.toString(),
      },
      ["purchaseUnitName", "conversionFactor"],
    ),
  });

  return { success: true, conversion };
}

export async function deleteUnitConversion(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ") };
  }

  const current = await prisma.unitConversion.findUnique({
    where: { id },
    include: { ingredient: true },
  });
  if (!current) return { error: "ไม่พบหน่วยซื้อ" };

  await prisma.unitConversion.delete({ where: { id } });

  await recordAuditLog(prisma, {
    branchId: current.ingredient.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "unit_conversion",
    entityId: id,
    entityName: `${current.ingredient.name} — ${current.purchaseUnitName}`,
  });

  return { success: true };
}
