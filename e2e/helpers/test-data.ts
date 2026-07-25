import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";

export interface TestMenu {
  ingredientId: string;
  recipeId: string;
  menuId: string;
  menuName: string;
}

// Minimal disposable menu (1 ingredient, no variant/modifier) for the POS E2E
// flow — cost-cascade math itself is already covered exactly against
// TESTING.md's reference dataset in lib/cost-formulas.test.ts.
export async function createTestMenu(createdBy: string): Promise<TestMenu> {
  const branch = await getOrCreateDefaultBranch();
  const suffix = Date.now();

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
      basePrice: 20,
      isAvailable: true,
      createdBy,
    },
  });

  return { ingredientId: ingredient.id, recipeId: recipe.id, menuId: menu.id, menuName };
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
