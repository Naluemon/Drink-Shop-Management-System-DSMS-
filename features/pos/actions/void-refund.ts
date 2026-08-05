"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateCompanySettings, getOrCreateTaxSettings } from "@/lib/settings";
import { isInBusinessDay } from "@/lib/business-day";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages } from "@/lib/pagination";
import { recordAuditLog, diffFields } from "@/lib/audit-log";
import { voidSchema, refundRequestSchema } from "../schemas/pos.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

async function getCompanySettings() {
  return getOrCreateCompanySettings();
}

// Creates the mirrored reversal SalesTransaction + line items/modifiers, and
// restores every ingredient consumed by the original sale. Shared by both
// Void (immediate) and approved Refund — the only difference between them is
// who's allowed to trigger it and under what conditions (see below).
async function createReversal(
  originalId: string,
  actorId: string,
  opts: { voidReason?: string; approvedBy?: string },
) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.salesTransaction.findUniqueOrThrow({
      where: { id: originalId },
      include: { items: { include: { modifiers: true } } },
    });

    const reversal = await tx.salesTransaction.create({
      data: {
        branchId: original.branchId,
        cashierId: original.cashierId,
        paymentMethod: original.paymentMethod,
        subtotal: original.subtotal,
        discountAmount: original.discountAmount,
        roundingAdjustment: original.roundingAdjustment,
        totalAmount: original.totalAmount,
        vatModeSnapshot: original.vatModeSnapshot,
        vatRateSnapshot: original.vatRateSnapshot,
        reversalOfId: original.id,
        voidReason: opts.voidReason ?? null,
        approvedBy: opts.approvedBy ?? null,
        createdBy: actorId,
      },
    });

    for (const item of original.items) {
      const reversalItem = await tx.salesTransactionItem.create({
        data: {
          salesTransactionId: reversal.id,
          menuId: item.menuId,
          menuVariantId: item.menuVariantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costAtSaleTime: item.costAtSaleTime,
          discountAmount: item.discountAmount,
        },
      });
      for (const mod of item.modifiers) {
        await tx.salesTransactionItemModifier.create({
          data: {
            salesTransactionItemId: reversalItem.id,
            modifierId: mod.modifierId,
            modifierNameSnapshot: mod.modifierNameSnapshot,
            priceDeltaSnapshot: mod.priceDeltaSnapshot,
            ingredientCostSnapshot: mod.ingredientCostSnapshot,
          },
        });
      }
    }

    // Restore every ingredient this sale consumed (FR-POS-12 / ARCHITECTURE §4)
    const originalMovements = await tx.inventoryMovement.findMany({
      where: {
        referenceType: "sales_transaction",
        referenceId: original.id,
        movementType: "stock_out",
      },
    });
    for (const movement of originalMovements) {
      await tx.inventoryMovement.create({
        data: {
          branchId: movement.branchId,
          ingredientId: movement.ingredientId,
          movementType: "reversal",
          quantity: movement.quantity,
          reversalOfId: movement.id,
          referenceType: "sales_transaction",
          referenceId: reversal.id,
          createdBy: actorId,
        },
      });
      await tx.ingredient.update({
        where: { id: movement.ingredientId },
        data: { currentStockQty: { increment: movement.quantity } },
      });
    }

    return reversal;
  });
}

// FR-POS-09: Cashier/Shift Supervisor void ได้เองภายในวันทางธุรกิจเดียวกัน
// (ดู AskUserQuestion เรื่อง shift/business-day) ก่อน settlement เท่านั้น
export async function voidTransaction(id: string, reason: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "pos_void");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ยกเลิกรายการขาย" };
    throw e;
  }

  const result = voidSchema.safeParse({ reason });
  if (!result.success) return { error: result.error.issues[0].message };

  const transaction = await prisma.salesTransaction.findUnique({ where: { id } });
  if (!transaction) return { error: "ไม่พบรายการขาย" };
  if (transaction.reversalOfId) return { error: "ยกเลิกรายการที่เป็น reversal เองไม่ได้" };

  const existingReversal = await prisma.salesTransaction.findFirst({ where: { reversalOfId: id } });
  if (existingReversal) return { error: "รายการนี้ถูกยกเลิก/คืนเงินไปแล้ว" };

  // Owner/Manager can void any transaction; Shift Supervisor/Cashier only their own
  if (actor.role !== "owner" && actor.role !== "manager" && transaction.cashierId !== actor.id) {
    return { error: "ยกเลิกได้เฉพาะรายการขายของตัวเอง" };
  }

  const companySettings = await getCompanySettings();
  const withinBusinessDay = isInBusinessDay(
    transaction.createdAt,
    new Date(),
    companySettings.timezone,
    companySettings.businessDayStartHour,
  );
  if (!withinBusinessDay) {
    return {
      error: 'รายการนี้ข้ามวันทางธุรกิจแล้ว — ใช้ "ขอคืนเงิน" แทน Void',
    };
  }

  const reversal = await createReversal(id, actor.id, { voidReason: result.data.reason });

  await recordAuditLog(prisma, {
    branchId: transaction.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "sale_void",
    entityId: reversal.id,
    entityName: `ยกเลิกบิล #${id.slice(0, 8)}`,
    changes: [{ field: "reason", oldValue: null, newValue: result.data.reason }],
  });

  return { success: true };
}

// FR-POS-10: Cashier ขอคืนเงินสำหรับรายการข้ามวันทางธุรกิจ — ต้องผ่านอนุมัติ
export async function requestRefund(salesTransactionId: string, reason: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "request", "pos_refund");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ขอคืนเงิน" };
    throw e;
  }

  const result = refundRequestSchema.safeParse({ reason });
  if (!result.success) return { error: result.error.issues[0].message };

  const transaction = await prisma.salesTransaction.findUnique({
    where: { id: salesTransactionId },
  });
  if (!transaction) return { error: "ไม่พบรายการขาย" };
  if (transaction.reversalOfId) return { error: "ขอคืนเงินสำหรับรายการที่เป็น reversal เองไม่ได้" };

  const existingReversal = await prisma.salesTransaction.findFirst({
    where: { reversalOfId: salesTransactionId },
  });
  if (existingReversal) return { error: "รายการนี้ถูกยกเลิก/คืนเงินไปแล้ว" };

  const existingRequest = await prisma.refundRequest.findFirst({
    where: { salesTransactionId, status: "pending" },
  });
  if (existingRequest) return { error: "มีคำขอคืนเงินสำหรับรายการนี้ค้างอยู่แล้ว" };

  const request = await prisma.refundRequest.create({
    data: { salesTransactionId, requestedBy: actor.id, reason: result.data.reason },
  });

  await recordAuditLog(prisma, {
    branchId: transaction.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "refund_request",
    entityId: request.id,
    entityName: `ขอคืนเงินบิล #${salesTransactionId.slice(0, 8)}`,
    changes: [{ field: "reason", oldValue: null, newValue: result.data.reason }],
  });

  return { success: true };
}

// FR-POS-11 / DECISIONS.md D5, D14: Shift Supervisor approve ได้เองถ้ายอด ≤
// refund_approval_threshold มิฉะนั้นต้อง Manager/Owner
export async function listRefundQueue() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  const canApproveAny = actor.role === "owner" || actor.role === "manager";
  const canApproveWithinThreshold = actor.role === "shift_supervisor";
  if (!canApproveAny && !canApproveWithinThreshold) {
    return { error: "คุณไม่มีสิทธิ์ดูคิวอนุมัติคืนเงิน" };
  }

  const requests = await prisma.refundRequest.findMany({
    where: { status: "pending" },
    include: { salesTransaction: true },
    orderBy: { createdAt: "asc" },
  });

  const taxSettings = await getOrCreateTaxSettings();
  const threshold = Number(taxSettings.refundApprovalThreshold);

  const visible = canApproveAny
    ? requests
    : requests.filter((r) => Number(r.salesTransaction.totalAmount) <= threshold);

  return {
    requests: visible.map((r) => ({
      id: r.id,
      salesTransactionId: r.salesTransactionId,
      totalAmount: r.salesTransaction.totalAmount.toString(),
      reason: r.reason,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt.toISOString(),
      withinOwnApprovalLimit: Number(r.salesTransaction.totalAmount) <= threshold,
    })),
    threshold: threshold.toString(),
  };
}

export async function approveRefund(requestId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "approve", "pos_refund");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์อนุมัติคืนเงิน" };
    throw e;
  }

  const request = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    include: { salesTransaction: true },
  });
  if (!request) return { error: "ไม่พบคำขอคืนเงิน" };
  if (request.status !== "pending") return { error: "คำขอนี้ถูกดำเนินการไปแล้ว" };

  // Shift Supervisor may only approve within threshold (D5/D14) — Owner/Manager have no limit
  if (actor.role === "shift_supervisor") {
    const taxSettings = await getOrCreateTaxSettings();
    const threshold = Number(taxSettings.refundApprovalThreshold);
    if (Number(request.salesTransaction.totalAmount) > threshold) {
      return {
        error: `ยอดเกินวงเงินที่อนุมัติเองได้ (${threshold.toFixed(2)} บาท) — ต้องส่งต่อ Manager/Owner`,
      };
    }
  }

  await createReversal(request.salesTransactionId, actor.id, { approvedBy: actor.id });

  await prisma.refundRequest.update({
    where: { id: requestId },
    data: { status: "approved", decidedBy: actor.id, decidedAt: new Date() },
  });

  await recordAuditLog(prisma, {
    branchId: request.salesTransaction.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "refund_request",
    entityId: requestId,
    entityName: `คืนเงินบิล #${request.salesTransactionId.slice(0, 8)}`,
    changes: diffFields({ status: request.status }, { status: "approved" }, ["status"]),
  });

  return { success: true };
}

export async function rejectRefund(requestId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "approve", "pos_refund");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ปฏิเสธคำขอคืนเงิน" };
    throw e;
  }

  const request = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    include: { salesTransaction: true },
  });
  if (!request) return { error: "ไม่พบคำขอคืนเงิน" };
  if (request.status !== "pending") return { error: "คำขอนี้ถูกดำเนินการไปแล้ว" };

  await prisma.refundRequest.update({
    where: { id: requestId },
    data: { status: "rejected", decidedBy: actor.id, decidedAt: new Date() },
  });

  await recordAuditLog(prisma, {
    branchId: request.salesTransaction.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "updated",
    entityType: "refund_request",
    entityId: requestId,
    entityName: `คืนเงินบิล #${request.salesTransactionId.slice(0, 8)}`,
    changes: diffFields({ status: request.status }, { status: "rejected" }, ["status"]),
  });

  return { success: true };
}

// FR-POS-09/10: recent sales so the register screen can offer "Void" (same
// business day, D5) or "Request Refund" (any earlier business day) per row.
// Owner/Manager see every cashier's sales; Shift Supervisor/Cashier see only
// their own (they can still request a refund on someone else's old sale via
// the approval queue's context, but the quick-action list here is "my sales").
export async function listRecentTransactions(page = 1) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  const companySettings = await getCompanySettings();

  const where =
    actor.role === "owner" || actor.role === "manager"
      ? { reversalOfId: null }
      : { reversalOfId: null, cashierId: actor.id };

  const [transactions, total] = await Promise.all([
    prisma.salesTransaction.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: getSkip(page),
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.salesTransaction.count({ where }),
  ]);

  const voidedIds = new Set(
    (
      await prisma.salesTransaction.findMany({
        where: { reversalOfId: { in: transactions.map((t) => t.id) } },
        select: { reversalOfId: true },
      })
    ).map((t) => t.reversalOfId),
  );

  const pendingRefundIds = new Set(
    (
      await prisma.refundRequest.findMany({
        where: { salesTransactionId: { in: transactions.map((t) => t.id) }, status: "pending" },
        select: { salesTransactionId: true },
      })
    ).map((r) => r.salesTransactionId),
  );

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      totalAmount: t.totalAmount.toString(),
      paymentMethod: t.paymentMethod,
      itemCount: t.items.length,
      createdAt: t.createdAt.toISOString(),
      isVoided: voidedIds.has(t.id),
      hasPendingRefund: pendingRefundIds.has(t.id),
      isWithinBusinessDay: isInBusinessDay(
        t.createdAt,
        new Date(),
        companySettings.timezone,
        companySettings.businessDayStartHour,
      ),
    })),
    page,
    totalPages: getTotalPages(total),
    total,
  };
}

// Row-click detail view for "รายการขายล่าสุด" — same visibility rule as
// listRecentTransactions/getReceiptData (Owner/Manager see any sale,
// everyone else only their own). voidReason lives on the reversal row
// (createReversal above), not the original, so it's read off that row.
export async function getTransactionDetail(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  const transaction = await prisma.salesTransaction.findUnique({
    where: { id },
    include: { items: { include: { menu: true, menuVariant: true, modifiers: true } } },
  });
  if (!transaction) return { error: "ไม่พบรายการขาย" };

  const canViewAny = actor.role === "owner" || actor.role === "manager";
  if (!canViewAny && transaction.cashierId !== actor.id) {
    return { error: "คุณไม่มีสิทธิ์ดูรายการนี้" };
  }

  const reversal = await prisma.salesTransaction.findFirst({ where: { reversalOfId: id } });
  const pendingRefund = await prisma.refundRequest.findFirst({
    where: { salesTransactionId: id, status: "pending" },
  });

  return {
    transaction: {
      id: transaction.id,
      createdAt: transaction.createdAt.toISOString(),
      paymentMethod: transaction.paymentMethod,
      subtotal: transaction.subtotal.toString(),
      discountAmount: transaction.discountAmount.toString(),
      roundingAdjustment: transaction.roundingAdjustment.toString(),
      totalAmount: transaction.totalAmount.toString(),
      isVoided: !!reversal,
      voidReason: reversal?.voidReason ?? null,
      hasPendingRefund: !!pendingRefund,
      items: transaction.items.map((item) => ({
        name: item.menuVariant ? `${item.menu.name} (${item.menuVariant.name})` : item.menu.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        discountAmount: item.discountAmount.toString(),
        modifiers: item.modifiers.map((m) => ({
          name: m.modifierNameSnapshot,
          priceDelta: m.priceDeltaSnapshot.toString(),
        })),
      })),
    },
  };
}
