"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { computeWeightedAverageCost } from "@/lib/cost-cascade";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages } from "@/lib/pagination";
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
import {
  purchaseOrderSchema,
  PurchaseOrderInput,
  purchaseOrderItemSchema,
  PurchaseOrderItemInput,
} from "../schemas/purchase-order.schema";

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

export async function listPurchaseOrders(
  filters?: {
    supplierId?: string;
    from?: string;
    to?: string;
  },
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูใบสั่งซื้อ") };
  }

  const where = {
    ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters?.from || filters?.to
      ? {
          orderedAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const [orders, total, pendingCount] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      include: { supplier: true, items: { include: { ingredient: true } } },
      orderBy: { orderedAt: "desc" },
      skip: getSkip(page, pageSize),
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
    // Counted independently of the paginated page/window so the "pending"
    // banner reflects the whole filtered set, not just what's on screen.
    prisma.purchaseOrder.count({ where: { ...where, status: "pending" } }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      supplierId: o.supplierId,
      supplierName: o.supplier.name,
      orderedAt: o.orderedAt.toISOString(),
      receivedAt: o.receivedAt?.toISOString() ?? null,
      items: o.items.map((it) => ({
        id: it.id,
        ingredientId: it.ingredientId,
        ingredientName: it.ingredient.name,
        purchaseUnitName: it.purchaseUnitName,
        quantity: it.quantity.toString(),
        unitPrice: it.unitPrice.toString(),
      })),
    })),
    total,
    page,
    totalPages: getTotalPages(total, pageSize),
    pendingCount,
  };
}

// FR-PUR-02: สร้าง PO เปล่าก่อน แล้วค่อยเพิ่มรายการ (เหมือน order + line items)
export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์สร้างใบสั่งซื้อ") };
  }

  const result = purchaseOrderSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const order = await prisma.purchaseOrder.create({
    data: {
      branchId: branch.id,
      supplierId: result.data.supplierId,
      status: "pending",
      createdBy: actor.id,
    },
    include: { supplier: true },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "purchase_order",
    entityId: order.id,
    entityName: `ใบสั่งซื้อ — ${order.supplier.name}`,
    changes: snapshotFields({ supplierId: order.supplierId, status: order.status }, [
      "supplierId",
      "status",
    ]),
  });

  return {
    success: true,
    order: {
      id: order.id,
      status: order.status,
      supplierId: order.supplierId,
      supplierName: order.supplier.name,
      orderedAt: order.orderedAt.toISOString(),
      receivedAt: null,
      items: [] as never[],
    },
  };
}

export async function addPurchaseOrderItem(purchaseOrderId: string, input: PurchaseOrderItemInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขใบสั่งซื้อ") };
  }

  const result = purchaseOrderItemSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { supplier: true },
  });
  if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
  if (order.status !== "pending") return { error: "แก้ไขใบสั่งซื้อที่รับของแล้วไม่ได้" };

  // ต้องมี unit_conversion ของ ingredient นี้ตรงกับ purchase_unit ที่เลือกไว้ก่อน
  // ไม่งั้นตอน Receive จะแปลงเป็น base_unit ไม่ได้ (DECISIONS.md D2)
  const conversion = await prisma.unitConversion.findFirst({
    where: {
      ingredientId: result.data.ingredientId,
      purchaseUnitName: result.data.purchaseUnitName,
    },
  });
  if (!conversion) {
    return { error: "วัตถุดิบนี้ยังไม่มีหน่วยซื้อนี้ตั้งค่าไว้ — ไปตั้งค่าที่หน้าวัตถุดิบก่อน" };
  }

  const ingredient = await prisma.ingredient.findUniqueOrThrow({
    where: { id: result.data.ingredientId },
  });

  const item = await prisma.purchaseOrderItem.create({
    data: {
      purchaseOrderId,
      ingredientId: result.data.ingredientId,
      purchaseUnitName: result.data.purchaseUnitName,
      quantity: result.data.quantity,
      unitPrice: result.data.unitPrice,
    },
  });

  await recordAuditLog(prisma, {
    branchId: order.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "purchase_order_item",
    entityId: item.id,
    entityName: `ใบสั่งซื้อ — ${order.supplier.name} — ${ingredient.name}`,
    changes: snapshotFields(
      {
        purchaseUnitName: item.purchaseUnitName,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      },
      ["purchaseUnitName", "quantity", "unitPrice"],
    ),
  });

  return {
    success: true,
    item: {
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: ingredient.name,
      purchaseUnitName: item.purchaseUnitName,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
    },
  };
}

export async function removePurchaseOrderItem(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขใบสั่งซื้อ") };
  }

  const item = await prisma.purchaseOrderItem.findUnique({
    where: { id },
    include: { purchaseOrder: { include: { supplier: true } }, ingredient: true },
  });
  if (!item) return { error: "ไม่พบรายการ" };
  if (item.purchaseOrder.status !== "pending") {
    return { error: "แก้ไขใบสั่งซื้อที่รับของแล้วไม่ได้" };
  }

  await prisma.purchaseOrderItem.delete({ where: { id } });

  await recordAuditLog(prisma, {
    branchId: item.purchaseOrder.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "purchase_order_item",
    entityId: id,
    entityName: `ใบสั่งซื้อ — ${item.purchaseOrder.supplier.name} — ${item.ingredient.name}`,
  });

  return { success: true };
}

// FR-PUR-03 / DECISIONS.md D1: Receive -> stock_in movement ต่อรายการ (ผูกกับ
// PurchaseOrderItem จริง — แก้ช่องว่างที่ Phase 6 Stock In มือยังทำไม่ได้) +
// recalculate cost_per_unit ด้วย WAC ทันที ทั้งหมดใน 1 atomic transaction ต่อ PO
export async function receivePurchaseOrder(purchaseOrderId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์รับสินค้า") };
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { items: true },
  });
  if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
  if (order.status !== "pending") return { error: "ใบสั่งซื้อนี้ถูกรับของหรือยกเลิกไปแล้ว" };
  if (order.items.length === 0) return { error: "ใบสั่งซื้อนี้ยังไม่มีรายการสินค้า" };

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const conversion = await tx.unitConversion.findFirst({
        where: { ingredientId: item.ingredientId, purchaseUnitName: item.purchaseUnitName },
      });
      if (!conversion) {
        throw new Error(
          `ไม่พบหน่วยแปลงของวัตถุดิบสำหรับหน่วยซื้อ "${item.purchaseUnitName}" — ไม่สามารถรับของได้`,
        );
      }

      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: item.ingredientId },
      });

      const receivedQtyBase = Number(item.quantity) * Number(conversion.conversionFactor);
      const receivedTotalCost = Number(item.quantity) * Number(item.unitPrice);
      const newCostPerUnit = computeWeightedAverageCost(
        Number(ingredient.currentStockQty),
        Number(ingredient.costPerUnit),
        receivedQtyBase,
        receivedTotalCost,
      );

      await tx.ingredient.update({
        where: { id: item.ingredientId },
        data: {
          currentStockQty: { increment: receivedQtyBase },
          costPerUnit: newCostPerUnit,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId: order.branchId,
          ingredientId: item.ingredientId,
          movementType: "stock_in",
          quantity: receivedQtyBase,
          referenceType: "purchase_order_item",
          referenceId: item.id,
          createdBy: actor.id,
        },
      });
    }

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "received", receivedAt: new Date(), updatedBy: actor.id },
    });

    // Only the PO's own status change is logged here — the per-ingredient
    // stock increments already get a permanent, timestamped record via
    // InventoryMovement above, so a second AuditLog entry per ingredient
    // would just duplicate that existing ledger.
    await recordAuditLog(tx, {
      branchId: order.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "purchase_order",
      entityId: purchaseOrderId,
      entityName: `ใบสั่งซื้อ #${purchaseOrderId.slice(0, 8)}`,
      changes: diffFields({ status: order.status }, { status: "received" }, ["status"]),
    });
  });

  return { success: true };
}

export async function cancelPurchaseOrder(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ") };
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!order) return { error: "ไม่พบใบสั่งซื้อ" };
  if (order.status !== "pending") return { error: "ยกเลิกได้เฉพาะใบสั่งซื้อที่ยังไม่ได้รับของ" };

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "cancelled", updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: order.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "purchase_order",
    entityId: id,
    entityName: `ใบสั่งซื้อ #${id.slice(0, 8)}`,
    changes: diffFields({ status: order.status }, { status: "cancelled" }, ["status"]),
  });

  return { success: true };
}
