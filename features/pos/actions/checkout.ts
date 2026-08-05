"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { getOrCreateTaxSettings, getOrCreateCompanySettings } from "@/lib/settings";
import {
  calculateRecipeCost,
  computeVariantCost,
  computeModifierCost,
  computeSaleItemCost,
} from "@/lib/cost-cascade";
import { computeTotalWithVat, roundToWholeBaht } from "@/lib/money-formulas";
import { resolveStockDeficitPolicy, StockDeficitBlockedError } from "@/lib/stock-deficit-policy";
import { recordAuditLog, snapshotFields } from "@/lib/audit-log";
import { checkoutSchema, CheckoutInput } from "../schemas/pos.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

interface ResolvedLine {
  menuId: string;
  menuName: string;
  menuVariantId: string | null;
  quantity: number;
  unitPrice: number;
  costAtSaleTime: number;
  discountAmount: number;
  modifiers: {
    modifierId: string;
    nameSnapshot: string;
    priceDeltaSnapshot: number;
    ingredientCostSnapshot: number | null;
  }[];
  // ingredientId -> base_unit quantity consumed by ONE unit of this line item
  ingredientConsumptionPerUnit: Map<string, number>;
}

// Re-derives price/cost entirely from current DB state — the client only
// ever sends *selections* (menuId/variantId/modifierIds/quantity), never a
// price, so a tampered client request can't change what gets charged.
async function resolveCartLine(
  item: CheckoutInput["items"][number],
): Promise<ResolvedLine | { error: string }> {
  const menu = await prisma.menu.findUnique({
    where: { id: item.menuId, deletedAt: null, isAvailable: true },
    include: {
      recipe: { include: { ingredients: true } },
      variants: { where: { deletedAt: null } },
      modifierGroups: {
        include: { modifierGroup: { include: { modifiers: { where: { deletedAt: null } } } } },
      },
    },
  });
  if (!menu) return { error: "ไม่พบเมนูนี้ หรือเมนูถูกปิดการขาย" };

  const variant = item.variantId ? menu.variants.find((v) => v.id === item.variantId) : null;
  if (item.variantId && !variant) return { error: "ไม่พบตัวเลือกขนาดนี้" };

  const mainRecipeCost = await calculateRecipeCost(menu.recipeId);
  const ingredientConsumptionPerUnit = new Map<string, number>();

  let variantCost: number;
  if (variant?.overrideRecipeId) {
    const overrideRecipeCost = await calculateRecipeCost(variant.overrideRecipeId);
    variantCost = computeVariantCost(mainRecipeCost, {
      recipeMultiplier: null,
      overrideRecipeCost,
    });
    const overrideRecipe = await prisma.recipe.findUniqueOrThrow({
      where: { id: variant.overrideRecipeId },
      include: { ingredients: true },
    });
    for (const ri of overrideRecipe.ingredients) {
      const perUnit = Number(ri.quantity) / Number(overrideRecipe.yield);
      ingredientConsumptionPerUnit.set(
        ri.ingredientId,
        (ingredientConsumptionPerUnit.get(ri.ingredientId) ?? 0) + perUnit,
      );
    }
  } else {
    const multiplier = variant?.recipeMultiplier ? Number(variant.recipeMultiplier) : 1;
    variantCost = computeVariantCost(mainRecipeCost, {
      recipeMultiplier: multiplier,
      overrideRecipeCost: null,
    });
    for (const ri of menu.recipe.ingredients) {
      const perUnit = (Number(ri.quantity) / Number(menu.recipe.yield)) * multiplier;
      ingredientConsumptionPerUnit.set(
        ri.ingredientId,
        (ingredientConsumptionPerUnit.get(ri.ingredientId) ?? 0) + perUnit,
      );
    }
  }

  const allModifiers = menu.modifierGroups.flatMap((mg) => mg.modifierGroup.modifiers);
  const selectedModifiers = item.modifierIds.map((id) => allModifiers.find((m) => m.id === id));
  if (selectedModifiers.some((m) => !m)) return { error: "ไม่พบตัวเลือกเสริมบางรายการ" };

  const resolvedModifiers = (
    selectedModifiers as NonNullable<(typeof selectedModifiers)[number]>[]
  ).map((mod) => {
    if (mod.ingredientId && mod.ingredientQuantity) {
      ingredientConsumptionPerUnit.set(
        mod.ingredientId,
        (ingredientConsumptionPerUnit.get(mod.ingredientId) ?? 0) + Number(mod.ingredientQuantity),
      );
    }
    return {
      modifierId: mod.id,
      nameSnapshot: mod.name,
      priceDeltaSnapshot: Number(mod.priceDelta),
      ingredientId: mod.ingredientId,
      ingredientQuantity: mod.ingredientQuantity ? Number(mod.ingredientQuantity) : null,
    };
  });

  // modifier cost needs the ingredient's live cost_per_unit — fetch in one batch
  const ingredientIds = resolvedModifiers.filter((m) => m.ingredientId).map((m) => m.ingredientId!);
  const ingredients =
    ingredientIds.length > 0
      ? await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : [];
  const costByIngredientId = new Map(ingredients.map((i) => [i.id, Number(i.costPerUnit)]));

  const modifierCosts = resolvedModifiers.map((m) =>
    computeModifierCost({
      ingredientQuantity: m.ingredientQuantity,
      ingredientCostPerUnit: m.ingredientId
        ? (costByIngredientId.get(m.ingredientId) ?? null)
        : null,
    }),
  );

  const unitPrice =
    Number(menu.basePrice) +
    (variant ? Number(variant.priceDelta) : 0) +
    resolvedModifiers.reduce((sum, m) => sum + m.priceDeltaSnapshot, 0);

  const costAtSaleTime = computeSaleItemCost(variantCost, modifierCosts);

  return {
    menuId: menu.id,
    menuName: menu.name,
    menuVariantId: variant?.id ?? null,
    quantity: item.quantity,
    unitPrice,
    costAtSaleTime,
    discountAmount: item.lineDiscountAmount,
    modifiers: resolvedModifiers.map((m, i) => ({
      modifierId: m.modifierId,
      nameSnapshot: m.nameSnapshot,
      priceDeltaSnapshot: m.priceDeltaSnapshot,
      // null means "no ingredient bound" (e.g. a sweetness level) — distinct
      // from a real ingredient whose cost_per_unit happens to be 0.
      ingredientCostSnapshot: m.ingredientId ? modifierCosts[i] : null,
    })),
    ingredientConsumptionPerUnit,
  };
}

// FR-POS-07: ยืนยันการขาย -> ตัดสต็อก + cost snapshot ทั้งหมดในธุรกรรมเดียว
// (atomic). FR-POS-08: สต็อกไม่พอไม่บล็อก แค่ flag is_stock_deficit. D16: กิน
// running number เฉพาะ transaction จริง — คำนวณเลขที่ภายใน transaction เดียวกัน
// ด้วย Serializable isolation กันสองงานขายชนกันแย่งเลขเดียวกัน (เหมือน bootstrap
// owner race ใน Phase 1).
export async function checkout(input: CheckoutInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "pos_sale");
  } catch (e) {
    if (e instanceof PermissionError) return { error: "คุณไม่มีสิทธิ์ขายสินค้า" };
    throw e;
  }

  const result = checkoutSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const resolvedLines: ResolvedLine[] = [];
  for (const item of result.data.items) {
    const resolved = await resolveCartLine(item);
    if ("error" in resolved) return { error: resolved.error };
    resolvedLines.push(resolved);
  }

  const branch = await getOrCreateDefaultBranch(actor.organizationId);
  const taxSettings = await getOrCreateTaxSettings();
  const companySettings = await getOrCreateCompanySettings();

  const subtotal = resolvedLines.reduce(
    (sum, l) => sum + (l.unitPrice * l.quantity - l.discountAmount),
    0,
  );
  const netAfterBillDiscount = subtotal - result.data.billDiscountAmount;
  const totalBeforeRounding = computeTotalWithVat(
    netAfterBillDiscount,
    Number(taxSettings.vatRate),
    taxSettings.vatMode,
  );
  const { rounded: totalAmount, adjustment: roundingAdjustment } =
    roundToWholeBaht(totalBeforeRounding);

  // Aggregate stock consumption across every line (same ingredient can be
  // used by multiple cart lines) so each ingredient only gets ONE ledger
  // movement per sale, not one per line.
  const totalConsumption = new Map<string, number>();
  for (const line of resolvedLines) {
    for (const [ingredientId, perUnitQty] of line.ingredientConsumptionPerUnit) {
      const totalQty = perUnitQty * line.quantity;
      totalConsumption.set(ingredientId, (totalConsumption.get(ingredientId) ?? 0) + totalQty);
    }
  }

  let anyDeficit = false;
  let transactionId = "";

  try {
    await prisma.$transaction(
      async (tx) => {
        let taxInvoiceNumber: number | null = null;
        if (companySettings.isVatRegistered) {
          const maxResult = await tx.salesTransaction.aggregate({
            _max: { taxInvoiceNumber: true },
          });
          taxInvoiceNumber = (maxResult._max.taxInvoiceNumber ?? 0) + 1;
        }

        const transaction = await tx.salesTransaction.create({
          data: {
            branchId: branch.id,
            cashierId: actor.id,
            paymentMethod: result.data.paymentMethod,
            subtotal,
            discountAmount: result.data.billDiscountAmount,
            roundingAdjustment,
            totalAmount,
            vatModeSnapshot: taxSettings.vatMode,
            vatRateSnapshot: taxSettings.vatRate,
            taxInvoiceNumber,
            createdBy: actor.id,
          },
        });
        transactionId = transaction.id;

        for (const line of resolvedLines) {
          const item = await tx.salesTransactionItem.create({
            data: {
              salesTransactionId: transaction.id,
              menuId: line.menuId,
              menuVariantId: line.menuVariantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              costAtSaleTime: line.costAtSaleTime,
              discountAmount: line.discountAmount,
            },
          });

          for (const mod of line.modifiers) {
            await tx.salesTransactionItemModifier.create({
              data: {
                salesTransactionItemId: item.id,
                modifierId: mod.modifierId,
                modifierNameSnapshot: mod.nameSnapshot,
                priceDeltaSnapshot: mod.priceDeltaSnapshot,
                ingredientCostSnapshot: mod.ingredientCostSnapshot,
              },
            });
          }
        }

        // One summary entry for the whole sale, not one per line/ingredient —
        // the line items themselves are already permanent
        // (SalesTransactionItem) and the stock deduction already gets its own
        // InventoryMovement row below, same reasoning as skipping per-item
        // logs on purchase-order receiving.
        await recordAuditLog(tx, {
          branchId: branch.id,
          actorId: actor.id,
          actorName: actor.fullName,
          action: "created",
          entityType: "sale",
          entityId: transaction.id,
          entityName: `บิลขาย #${transaction.id.slice(0, 8)} — ${resolvedLines.map((l) => `${l.menuName} x${l.quantity}`).join(", ")}`,
          changes: snapshotFields(
            {
              paymentMethod: result.data.paymentMethod,
              itemCount: resolvedLines.length,
              totalAmount: totalAmount.toString(),
            },
            ["paymentMethod", "itemCount", "totalAmount"],
          ),
        });

        for (const [ingredientId, quantity] of totalConsumption) {
          const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
          const isStockDeficit = Number(ingredient.currentStockQty) < quantity;

          if (isStockDeficit) {
            const policy = resolveStockDeficitPolicy(
              ingredient.stockDeficitPolicyOverride,
              companySettings.stockDeficitPolicy,
            );
            if (policy === "strict_block") throw new StockDeficitBlockedError(ingredient.name);
            anyDeficit = true;
          }

          await tx.inventoryMovement.create({
            data: {
              branchId: branch.id,
              ingredientId,
              movementType: "stock_out",
              quantity,
              isStockDeficit,
              referenceType: "sales_transaction",
              referenceId: transaction.id,
              createdBy: actor.id,
            },
          });
          await tx.ingredient.update({
            where: { id: ingredientId },
            data: { currentStockQty: { decrement: quantity } },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    if (e instanceof StockDeficitBlockedError) {
      return {
        error: `สต็อก "${e.ingredientName}" ไม่พอ และตั้งค่าเป็นบล็อกเข้มงวดไว้ (Settings) — ไม่สามารถขายต่อได้จนกว่าจะรับสต็อกเข้า`,
      };
    }
    throw e;
  }

  return { success: true, transactionId, totalAmount, isStockDeficit: anyDeficit };
}
