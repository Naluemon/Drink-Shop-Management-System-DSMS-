// TESTING.md §10: "Dashboard (Phase 10): ทดสอบ load time ต้อง < 2 วินาทีภายใต้
// ข้อมูลจำลองระดับ production (เช่น 1 ปีของธุรกรรม)". Run after prisma/seed-perf.ts.
//
// This mirrors the exact query shape of features/dashboard/actions/dashboard.ts
// (getDashboardData + getDashboardTrend) rather than calling those "use server"
// exports directly — they depend on next/headers' cookies() for Supabase auth,
// which only exists inside a real Next.js request. The query pattern (not the
// auth wrapper) is what has any chance of being slow, so timing it here is
// equivalent for this purpose.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getBusinessDayRange } from "@/lib/business-day";
import { getOrCreateCompanySettings } from "@/lib/settings";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  const verdict = ms < 2000 ? "PASS" : "FAIL (>= 2000ms budget)";
  console.log(`${verdict}  ${label}: ${ms.toFixed(0)}ms`);
  return result;
}

async function summarizePeriod(start: Date, end: Date) {
  const transactions = await prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: true },
  });
  const expenseEntries = await prisma.expenseEntry.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });
  return { transactions: transactions.length, expenseEntries: expenseEntries.length };
}

async function getBestSellers(start: Date, end: Date) {
  return prisma.salesTransaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { items: { include: { menu: true } } },
  });
}

// Matches features/dashboard/actions/dashboard.ts's fetchTransactionAggregates()
async function getTrend(rangeStart: Date, rangeEnd: Date) {
  return Promise.all([
    prisma.$queryRaw`
      SELECT st.created_at AS "createdAt", st.total_amount::float8 AS "totalAmount",
             st.reversal_of_id AS "reversalOfId",
             COALESCE(SUM(sti.cost_at_sale_time * sti.quantity), 0)::float8 AS "cogs"
      FROM sales_transactions st
      LEFT JOIN sales_transaction_items sti ON sti.sales_transaction_id = st.id
      WHERE st.created_at >= ${rangeStart} AND st.created_at < ${rangeEnd}
      GROUP BY st.id, st.created_at, st.total_amount, st.reversal_of_id
    `,
    prisma.expenseEntry.findMany({ where: { createdAt: { gte: rangeStart, lt: rangeEnd } } }),
  ]);
}

async function main() {
  const totalTx = await prisma.salesTransaction.count();
  console.log(`Total sales_transactions in DB: ${totalTx}\n`);

  const settings = await getOrCreateCompanySettings();
  const now = new Date();
  const today = getBusinessDayRange(now, settings.timezone, settings.businessDayStartHour);
  const yesterday = getBusinessDayRange(
    new Date(now.getTime() - 86400000),
    settings.timezone,
    settings.businessDayStartHour,
  );
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Full initial dashboard load: today + yesterday + best-sellers + 7d trend, in parallel — matches getDashboardData()'s Promise.all exactly.
  await timed("Full initial dashboard load (today+yesterday+bestSellers+7d trend, parallel)", () =>
    Promise.all([
      summarizePeriod(today.start, today.end),
      summarizePeriod(yesterday.start, yesterday.end),
      getBestSellers(today.start, today.end),
      getTrend(sevenDaysAgo, now),
    ]),
  );

  // Worst case: user switches the period filter to 12 months — this is the
  // query most likely to degrade at scale since it loads every row for the
  // range into Node and reduces in JS rather than aggregating in SQL.
  await timed("12-month trend fetch (getDashboardTrend('12m') query shape)", () =>
    getTrend(twelveMonthsAgo, now),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
