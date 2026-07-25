import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCompanySettings } from "@/lib/settings";
import type { ReceiptData } from "../lib/receipt-html";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

// Same visibility rule as listRecentTransactions (features/pos/actions/void-refund.ts):
// Owner/Manager can view any receipt, everyone else only their own sale.
export async function getReceiptData(
  transactionId: string,
): Promise<{ data: ReceiptData } | { error: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  const transaction = await prisma.salesTransaction.findUnique({
    where: { id: transactionId },
    include: {
      items: {
        include: { menu: true, menuVariant: true, modifiers: true },
      },
    },
  });
  if (!transaction) return { error: "ไม่พบรายการขายนี้" };

  const canViewAny = actor.role === "owner" || actor.role === "manager";
  if (!canViewAny && transaction.cashierId !== actor.id) {
    return { error: "คุณไม่มีสิทธิ์ดูใบเสร็จนี้" };
  }

  const company = await getOrCreateCompanySettings();

  const data: ReceiptData = {
    company: {
      name: company.registeredName ?? "ร้านเครื่องดื่ม",
      address: company.registeredAddress,
      phone: company.companyPhone,
      taxId: company.taxId,
      isVatRegistered: company.isVatRegistered,
      footerMessage: company.receiptFooterMessage,
    },
    paperWidth: company.receiptPaperWidth,
    transaction: {
      createdAt: transaction.createdAt.toISOString(),
      paymentMethod: transaction.paymentMethod,
      taxInvoiceNumber: transaction.taxInvoiceNumber,
      vatModeSnapshot: transaction.vatModeSnapshot,
      vatRateSnapshot: transaction.vatRateSnapshot.toString(),
      subtotal: transaction.subtotal.toString(),
      discountAmount: transaction.discountAmount.toString(),
      roundingAdjustment: transaction.roundingAdjustment.toString(),
      totalAmount: transaction.totalAmount.toString(),
      isVoided: transaction.reversalOfId !== null,
      voidReason: transaction.voidReason,
    },
    items: transaction.items.map((item) => ({
      name: item.menuVariant ? `${item.menu.name} (${item.menuVariant.name})` : item.menu.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      modifiers: item.modifiers.map((m) => ({
        name: m.modifierNameSnapshot,
        priceDelta: m.priceDeltaSnapshot.toString(),
      })),
    })),
  };

  return { data };
}
