import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { getOrCreateTaxSettings } from "@/lib/settings";

export interface TestMenu {
  ingredientId: string;
  recipeId: string;
  menuId: string;
  menuName: string;
}

// Minimal disposable menu (1 ingredient, no variant/modifier) for the POS E2E
// flow — cost-cascade math itself is already covered exactly against
// TESTING.md's reference dataset in lib/cost-formulas.test.ts. basePrice
// defaults to 20 (well under the default refund threshold); pass a higher
// value for the above-threshold refund-approval scenario.
export async function createTestMenu(createdBy: string, basePrice = 20): Promise<TestMenu> {
  const { organizationId } = await prisma.user.findUniqueOrThrow({ where: { id: createdBy } });
  const branch = await getOrCreateDefaultBranch(organizationId);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const ingredient = await prisma.ingredient.create({
    data: {
      branchId: branch.id,
      name: `E2E วัตถุดิบ ${suffix}`,
      baseUnit: "gram",
      costPerUnit: 1,
      currentStockQty: 1000,
      createdBy,
    },
  });

  const recipe = await prisma.recipe.create({
    data: {
      branchId: branch.id,
      name: `E2E สูตร ${suffix}`,
      yield: 1,
      createdBy,
      ingredients: { create: [{ ingredientId: ingredient.id, quantity: 10 }] },
    },
  });

  const menuName = `E2E เมนูทดสอบ ${suffix}`;
  const menu = await prisma.menu.create({
    data: {
      branchId: branch.id,
      recipeId: recipe.id,
      name: menuName,
      basePrice,
      isAvailable: true,
      createdBy,
    },
  });

  return { ingredientId: ingredient.id, recipeId: recipe.id, menuId: menu.id, menuName };
}

// Pushes a transaction's createdAt outside "today" (business-day boundary)
// so the POS UI offers "ขอคืนเงิน" (Refund) instead of "ยกเลิก (Void)" for
// it — see features/pos/components/recent-transactions-panel.tsx.
export async function backdateSalesTransaction(transactionId: string, daysAgo = 2): Promise<void> {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await prisma.salesTransaction.update({ where: { id: transactionId }, data: { createdAt } });
  await prisma.salesTransactionItem.updateMany({
    where: { salesTransactionId: transactionId },
    data: { createdAt },
  });
}

export async function getRefundApprovalThreshold(): Promise<number> {
  const taxSettings = await getOrCreateTaxSettings();
  return Number(taxSettings.refundApprovalThreshold);
}

export function getIngredientStock(ingredientId: string) {
  return prisma.ingredient
    .findUniqueOrThrow({ where: { id: ingredientId } })
    .then((i) => Number(i.currentStockQty));
}

export interface TestModifierGroup {
  groupId: string;
  groupName: string;
  modifierName: string;
  supportIngredientId: string;
}

// A disposable modifier group bound to its own ingredient (so the modifier
// itself carries a nonzero cost, per DECISIONS.md D3) — for the "menu with
// variant + modifier, cost computed correctly" E2E scenario. The ingredient
// this creates is separate from the one exercised via the UI in that test,
// since attaching/toggling the modifier is what's under test here, not
// re-deriving its own ingredient-cost math (already covered in
// lib/cost-formulas.test.ts).
export async function createTestModifierGroup(
  createdBy: string,
  ingredientCostPerUnit: number,
  ingredientQuantity: number,
  priceDelta: number,
): Promise<TestModifierGroup> {
  const { organizationId } = await prisma.user.findUniqueOrThrow({ where: { id: createdBy } });
  const branch = await getOrCreateDefaultBranch(organizationId);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const supportIngredient = await prisma.ingredient.create({
    data: {
      branchId: branch.id,
      name: `E2E วัตถุดิบเสริม ${suffix}`,
      baseUnit: "gram",
      costPerUnit: ingredientCostPerUnit,
      currentStockQty: 1000,
      createdBy,
    },
  });

  const modifierName = `E2E ตัวเลือกเสริม ${suffix}`;
  const group = await prisma.modifierGroup.create({
    data: {
      branchId: branch.id,
      name: `E2E กลุ่มตัวเลือก ${suffix}`,
      selectionType: "multiple",
      isRequired: false,
      modifiers: {
        create: [
          {
            name: modifierName,
            ingredientId: supportIngredient.id,
            ingredientQuantity,
            priceDelta,
          },
        ],
      },
    },
  });

  return {
    groupId: group.id,
    groupName: group.name,
    modifierName,
    supportIngredientId: supportIngredient.id,
  };
}

export async function deleteTestModifierGroup(fixture: TestModifierGroup): Promise<void> {
  await prisma.menuModifierGroup.deleteMany({ where: { modifierGroupId: fixture.groupId } });
  await prisma.modifier.deleteMany({ where: { modifierGroupId: fixture.groupId } });
  await prisma.modifierGroup.delete({ where: { id: fixture.groupId } });
  await prisma.ingredient.deleteMany({ where: { id: fixture.supportIngredientId } });
}

// FK-safe teardown for whatever an ingredient/recipe/menu CRUD-chain E2E
// test created via the real UI (unlike createTestMenu's fixture, ids are
// collected from the UI as the test creates each row, in order).
export async function deleteMenuChain(ids: {
  menuId?: string;
  variantIds?: string[];
  recipeId?: string;
  recipeIngredientIds?: string[];
  ingredientId?: string;
  unitConversionIds?: string[];
}): Promise<void> {
  if (ids.menuId) {
    await prisma.menuModifierGroup.deleteMany({ where: { menuId: ids.menuId } });
  }
  if (ids.variantIds?.length) {
    await prisma.menuVariant.deleteMany({ where: { id: { in: ids.variantIds } } });
  }
  if (ids.menuId) {
    await prisma.menu.deleteMany({ where: { id: ids.menuId } });
  }
  if (ids.recipeIngredientIds?.length) {
    await prisma.recipeIngredient.deleteMany({ where: { id: { in: ids.recipeIngredientIds } } });
  }
  if (ids.recipeId) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: ids.recipeId } });
    await prisma.recipe.deleteMany({ where: { id: ids.recipeId } });
  }
  if (ids.unitConversionIds?.length) {
    await prisma.unitConversion.deleteMany({ where: { id: { in: ids.unitConversionIds } } });
  }
  if (ids.ingredientId) {
    await prisma.unitConversion.deleteMany({ where: { ingredientId: ids.ingredientId } });
    await prisma.ingredient.deleteMany({ where: { id: ids.ingredientId } });
  }
}

export async function deleteTestMenu(testMenu: TestMenu): Promise<void> {
  // FK-safe order: sales items referencing the menu -> sales transactions
  // they belong to -> inventory movements on the ingredient -> menu -> recipe
  // ingredients -> recipe -> ingredient.
  const items = await prisma.salesTransactionItem.findMany({
    where: { menuId: testMenu.menuId },
    select: { id: true, salesTransactionId: true },
  });
  const itemIds = items.map((i) => i.id);
  const transactionIds = [...new Set(items.map((i) => i.salesTransactionId))];

  if (itemIds.length > 0) {
    await prisma.salesTransactionItemModifier.deleteMany({
      where: { salesTransactionItemId: { in: itemIds } },
    });
    await prisma.salesTransactionItem.deleteMany({ where: { id: { in: itemIds } } });
  }
  if (transactionIds.length > 0) {
    await prisma.refundRequest.deleteMany({
      where: { salesTransactionId: { in: transactionIds } },
    });
    // Reversal rows reference an original via reversalOfId — delete those first
    await prisma.salesTransaction.deleteMany({ where: { reversalOfId: { in: transactionIds } } });
    await prisma.salesTransaction.deleteMany({ where: { id: { in: transactionIds } } });
  }
  await prisma.inventoryMovement.deleteMany({ where: { ingredientId: testMenu.ingredientId } });
  await prisma.menu.deleteMany({ where: { id: testMenu.menuId } });
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: testMenu.recipeId } });
  await prisma.recipe.deleteMany({ where: { id: testMenu.recipeId } });
  await prisma.ingredient.deleteMany({ where: { id: testMenu.ingredientId } });
}
