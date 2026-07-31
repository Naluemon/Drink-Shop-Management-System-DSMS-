"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { getOrCreateCompanySettings } from "@/lib/settings";
import { resolveStockDeficitPolicy, StockDeficitBlockedError } from "@/lib/stock-deficit-policy";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages } from "@/lib/pagination";
import {
  stockInSchema,
  StockInInput,
  stockOutSchema,
  StockOutInput,
  adjustmentSchema,
  AdjustmentInput,
} from "../schemas/inventory.schema";

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

// FR-ING-06/FR-INV-04: current stock + low-stock threshold per ingredient —
// reuses the same Ingredient rows Phase 3 already exposes at /ingredients.
export async function listStockLevels() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสต็อก") };
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    include: { unitConversions: true },
    orderBy: { name: "asc" },
  });

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      currentStockQty: i.currentStockQty.toString(),
      lowStockThreshold: i.lowStockThreshold?.toString() ?? null,
      unitConversions: i.unitConversions.map((c) => ({
        id: c.id,
        purchaseUnitName: c.purchaseUnitName,
        conversionFactor: c.conversionFactor.toString(),
      })),
    })),
  };
}

// FR-INV-05: append-only ledger — every change is InventoryMovement + the
// Ingredient.currentStockQty update in one atomic transaction (AGENTS.md §4).
export async function recordStockIn(input: StockInInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "stock_in");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์รับสินค้าเข้าสต็อก") };
  }

  const result = stockInSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const movement = await prisma.$transaction(async (tx) => {
    const m = await tx.inventoryMovement.create({
      data: {
        branchId: branch.id,
        ingredientId: result.data.ingredientId,
        movementType: "stock_in",
        quantity: result.data.quantity,
        referenceType: result.data.note ? "manual_note" : null,
        referenceId: null,
        createdBy: actor.id,
      },
    });
    await tx.ingredient.update({
      where: { id: result.data.ingredientId },
      data: { currentStockQty: { increment: result.data.quantity } },
    });
    return m;
  });

  return { success: true, movementId: movement.id };
}

// FR-INV-02: stock_out ต้องมี reason_code จากลิสต์เสมอ (D12) — D4: สต็อกไม่พอ
// ยังทำต่อได้ (non-blocking) แต่ flag is_stock_deficit ไว้ให้ Manager/Owner เห็น
export async function recordStockOut(input: StockOutInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "stock_out");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ตัดสต็อกออก") };
  }

  const result = stockOutSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const validReasonCode = await prisma.reasonCode.findFirst({
    where: { code: result.data.reasonCode, isActive: true, deletedAt: null },
  });
  if (!validReasonCode) return { error: "เหตุผลที่เลือกไม่ถูกต้องหรือถูกปิดใช้งานแล้ว" };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const companySettings = await getOrCreateCompanySettings();

  try {
    const { movement, isStockDeficit } = await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: result.data.ingredientId },
      });
      const deficit = Number(ingredient.currentStockQty) < result.data.quantity;

      if (deficit) {
        const policy = resolveStockDeficitPolicy(
          ingredient.stockDeficitPolicyOverride,
          companySettings.stockDeficitPolicy,
        );
        if (policy === "strict_block") throw new StockDeficitBlockedError(ingredient.name);
      }

      const m = await tx.inventoryMovement.create({
        data: {
          branchId: branch.id,
          ingredientId: result.data.ingredientId,
          movementType: "stock_out",
          quantity: result.data.quantity,
          reasonCode: result.data.reasonCode,
          isStockDeficit: deficit,
          createdBy: actor.id,
        },
      });
      await tx.ingredient.update({
        where: { id: result.data.ingredientId },
        data: { currentStockQty: { decrement: result.data.quantity } },
      });
      return { movement: m, isStockDeficit: deficit };
    });

    return { success: true, movementId: movement.id, isStockDeficit };
  } catch (e) {
    if (e instanceof StockDeficitBlockedError) {
      return {
        error: `สต็อก "${e.ingredientName}" ไม่พอ และตั้งค่าเป็นบล็อกเข้มงวดไว้ (Settings) — กรุณารับสต็อกเข้าก่อนหรือปรับจำนวน`,
      };
    }
    throw e;
  }
}

// FR-INV-03 / DECISIONS.md D12: adjustment อิสระ จำกัด Manager/Owner เท่านั้น
export async function recordAdjustment(input: AdjustmentInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "adjustment");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ปรับปรุงสต็อกอิสระ") };
  }

  const result = adjustmentSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const movement = await prisma.$transaction(async (tx) => {
    const m = await tx.inventoryMovement.create({
      data: {
        branchId: branch.id,
        ingredientId: result.data.ingredientId,
        movementType: "adjustment",
        quantity: result.data.delta,
        reasonCode: result.data.note || null,
        createdBy: actor.id,
      },
    });
    await tx.ingredient.update({
      where: { id: result.data.ingredientId },
      data: { currentStockQty: { increment: result.data.delta } },
    });
    return m;
  });

  return { success: true, movementId: movement.id };
}

// Movement log — matches SECURITY.md §1's Inventory rows: only Owner/Manager
// have anything beyond bare "Create" on stock_in/stock_out/adjustment, so
// only they get to browse the ledger itself.
export async function listRecentMovements(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  const canViewLedger = actor.role === "owner" || actor.role === "manager";
  if (!canViewLedger) {
    return { error: "คุณไม่มีสิทธิ์ดูประวัติการเคลื่อนไหวสต็อก" };
  }

  const [movements, total] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({
      skip: getSkip(page, pageSize),
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { ingredient: true },
    }),
    prisma.inventoryMovement.count(),
  ]);

  return {
    movements: movements.map((m) => ({
      id: m.id,
      ingredientName: m.ingredient.name,
      baseUnit: m.ingredient.baseUnit,
      movementType: m.movementType,
      quantity: m.quantity.toString(),
      reasonCode: m.reasonCode,
      isStockDeficit: m.isStockDeficit,
      createdAt: m.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: getTotalPages(total, pageSize),
  };
}
