// TESTING.md §10 performance test data: "~1 ปีของธุรกรรม สร้างจากการวนซ้ำ §2
// Reference Dataset". Generates production-scale sales volume (bulk insert,
// its own UUIDs so items can be linked without a round trip per row) so the
// dashboard's real query path can be timed against real data, not a guess.
// Rerunning is safe — skips generation once the transaction count already
// looks like a full year's worth.
import "dotenv/config";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { calculateVariantCost } from "@/lib/cost-cascade";

const DAYS = 365;
const TX_PER_DAY = 40; // ~14,600 transactions/year — a busy single-branch shop
const BATCH_SIZE = 2000;

async function main() {
  const existing = await prisma.salesTransaction.count();
  if (existing > DAYS * TX_PER_DAY * 0.8) {
    console.log(`Already have ${existing} sales transactions — skipping perf data generation.`);
    return;
  }

  const branch = await prisma.branch.findFirstOrThrow();
  const menu = await prisma.menu.findFirstOrThrow({
    where: { name: "ชาไทยเย็น" },
    include: { variants: true },
  });
  const variant = menu.variants.find((v) => v.isDefault) ?? menu.variants[0];
  const cashiers = await prisma.user.findMany({
    where: { role: { in: ["cashier", "shift_supervisor"] } },
  });
  const taxSettings = await prisma.taxSettings.findFirstOrThrow();
  const expenseCategory = await prisma.expenseCategory.findFirstOrThrow();

  const unitPrice = Number(menu.basePrice) + Number(variant.priceDelta);
  const costAtSaleTime = await calculateVariantCost(variant.id);

  const now = new Date();
  type TxData = Extract<
    NonNullable<Parameters<typeof prisma.salesTransaction.createMany>[0]>["data"],
    unknown[]
  >[number];
  type ItemData = Extract<
    NonNullable<Parameters<typeof prisma.salesTransactionItem.createMany>[0]>["data"],
    unknown[]
  >[number];
  type ExpenseData = Extract<
    NonNullable<Parameters<typeof prisma.expenseEntry.createMany>[0]>["data"],
    unknown[]
  >[number];
  let txBatch: TxData[] = [];
  let itemBatch: ItemData[] = [];
  let expenseBatch: ExpenseData[] = [];
  let totalTx = 0;

  async function flush() {
    if (txBatch.length) await prisma.salesTransaction.createMany({ data: txBatch });
    if (itemBatch.length) await prisma.salesTransactionItem.createMany({ data: itemBatch });
    if (expenseBatch.length) await prisma.expenseEntry.createMany({ data: expenseBatch });
    totalTx += txBatch.length;
    process.stdout.write(`\rInserted ${totalTx} transactions...`);
    txBatch = [];
    itemBatch = [];
    expenseBatch = [];
  }

  for (let day = DAYS - 1; day >= 0; day--) {
    const dayStart = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);

    for (let i = 0; i < TX_PER_DAY; i++) {
      const createdAt = new Date(dayStart);
      createdAt.setHours(7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0);

      const txId = randomUUID();
      const cashier = cashiers[Math.floor(Math.random() * cashiers.length)] ?? cashiers[0];

      txBatch.push({
        id: txId,
        branchId: branch.id,
        cashierId: cashier.id,
        paymentMethod: Math.random() > 0.5 ? "cash" : "qr",
        subtotal: unitPrice,
        discountAmount: 0,
        roundingAdjustment: 0,
        totalAmount: unitPrice,
        vatModeSnapshot: taxSettings.vatMode,
        vatRateSnapshot: taxSettings.vatRate,
        createdBy: cashier.id,
        createdAt,
      });

      itemBatch.push({
        id: randomUUID(),
        salesTransactionId: txId,
        menuId: menu.id,
        menuVariantId: variant.id,
        quantity: 1,
        unitPrice,
        costAtSaleTime,
        createdAt,
      });
    }

    expenseBatch.push({
      branchId: branch.id,
      categoryId: expenseCategory.id,
      amount: 800 + Math.random() * 400,
      description: "ค่าใช้จ่ายประจำวัน (perf test data)",
      createdBy: cashiers[0].id,
      createdAt: new Date(dayStart.setHours(23, 0, 0, 0)),
    });

    if (txBatch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log("\nPerf data generation complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
