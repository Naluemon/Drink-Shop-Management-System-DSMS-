import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import {
  createTestMenu,
  deleteTestMenu,
  backdateSalesTransaction,
  getRefundApprovalThreshold,
  type TestMenu,
} from "./helpers/test-data";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "Request refund ข้ามกะ → Shift Supervisor approve (ยอดต่ำกว่า
// threshold) และ Manager approve (ยอดสูงกว่า threshold) → reversal เกิดขึ้น
// พร้อม audit trail ครบ" (DECISIONS.md D5/D14).
//
// The POS UI only offers "ขอคืนเงิน" for a transaction outside today's
// business day (see recent-transactions-panel.tsx) — since a real E2E run
// can't wait a day, each sale's createdAt is pushed back via
// backdateSalesTransaction() right after checkout, which is the same
// approach the app itself uses to distinguish Void from Refund eligibility.
let cashier: TestUser;
let shiftSupervisor: TestUser;
let manager: TestUser;
let cheapMenu: TestMenu;
let expensiveMenu: TestMenu;
let cheapAmount: number;
let expensiveAmount: number;

test.beforeAll(async () => {
  cashier = await createTestUser("cashier");
  shiftSupervisor = await createTestUser("shift_supervisor");
  manager = await createTestUser("manager");
  const threshold = await getRefundApprovalThreshold();
  cheapAmount = Math.min(20, threshold - 1);
  expensiveAmount = threshold + 200;
  cheapMenu = await createTestMenu(cashier.id, cheapAmount);
  expensiveMenu = await createTestMenu(cashier.id, expensiveAmount);
});

test.afterAll(async () => {
  await deleteTestMenu(cheapMenu);
  await deleteTestMenu(expensiveMenu);
  await deleteTestUser(cashier);
  await deleteTestUser(shiftSupervisor);
  await deleteTestUser(manager);
});

// listRecentTransactions() scopes non-owner/manager roles to "my sales"
// (see features/pos/actions/void-refund.ts), and this cashier fixture starts
// with zero transactions — so the most-recently-sold item is always the
// first row, with no need to disambiguate against other dev-DB activity.
//
// The refund reason is set to the menu's own (globally-unique, timestamped)
// name rather than a fixed string — the refund queue on /refunds is
// branch-wide and shows dollar amounts that can coincidentally collide
// (e.g. two ฿20 requests from unrelated activity), but nothing else will
// ever share this exact reason text.
async function sellAndRequestRefund(
  page: import("@playwright/test").Page,
  menu: TestMenu,
): Promise<void> {
  await page.goto("/pos");
  await page.getByRole("button", { name: new RegExp(menu.menuName) }).click();
  await page.getByRole("button", { name: "ยืนยันการขาย" }).click();
  await expect(page.getByText("ขายสำเร็จ")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "ขายต่อ" }).click();

  await page.goto("/pos");
  await page.reload();
  const row = page.getByTestId("recent-transaction-row").first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  await backdateLatestSale(menu.menuId);

  await page.reload();
  const backdatedRow = page.getByTestId("recent-transaction-row").first();
  await backdatedRow.getByRole("button", { name: "ขอคืนเงิน" }).click();
  await page.getByPlaceholder("เช่น ลูกค้าเปลี่ยนใจ / กดผิด").fill(refundReasonFor(menu));
  await page.getByRole("button", { name: "ส่งคำขอคืนเงิน" }).click();
  await expect(backdatedRow.getByText("รออนุมัติคืนเงิน")).toBeVisible({ timeout: 10_000 });
}

function refundReasonFor(menu: TestMenu): string {
  return `E2E refund test ${menu.menuName}`;
}

// Backdates the most recent sale of this menu (there's exactly one per test,
// since each menu fixture is disposable and sold only once) so the UI treats
// it as a prior business day instead of today.
async function backdateLatestSale(menuId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const item = await prisma.salesTransactionItem.findFirstOrThrow({
    where: { menuId },
    orderBy: { createdAt: "desc" },
  });
  await backdateSalesTransaction(item.salesTransactionId, 2);
}

test("Shift Supervisor self-approves a refund at/below threshold; over-threshold routes to Manager only", async ({
  browser,
}) => {
  // approveRefund() runs a multi-step Prisma transaction (reversal + items +
  // modifiers + inventory restoration) over a remote connection — the
  // default 30s test timeout leaves too little room after everything else
  // this test already does (2 sales, 2 refund requests, 2 approvals).
  test.setTimeout(60_000);
  // Cashier: sell + request refund for both the cheap (≤ threshold) and
  // expensive (> threshold) menus.
  const cheapReason = refundReasonFor(cheapMenu);
  const expensiveReason = refundReasonFor(expensiveMenu);

  const cashierPage = await (await browser.newContext()).newPage();
  await loginAs(cashierPage, cashier.email, cashier.password);
  await sellAndRequestRefund(cashierPage, cheapMenu);
  await sellAndRequestRefund(cashierPage, expensiveMenu);
  await cashierPage.close();

  // Shift Supervisor: sees + approves the cheap one; the expensive one never
  // appears in their queue at all (listRefundQueue filters it out for D5/D14).
  const supervisorPage = await (await browser.newContext()).newPage();
  await loginAs(supervisorPage, shiftSupervisor.email, shiftSupervisor.password);
  await supervisorPage.goto("/refunds");

  const cheapRequestRow = supervisorPage
    .getByTestId("refund-request-row")
    .filter({ hasText: cheapReason });
  await expect(cheapRequestRow).toBeVisible({ timeout: 10_000 });
  await expect(
    supervisorPage.getByTestId("refund-request-row").filter({ hasText: expensiveReason }),
  ).toHaveCount(0);

  await cheapRequestRow.getByRole("button", { name: "อนุมัติ" }).click();
  await expect(cheapRequestRow).toBeHidden({ timeout: 20_000 });
  await supervisorPage.close();

  // Manager: sees + approves the expensive one (no threshold limit for D14).
  const managerPage = await (await browser.newContext()).newPage();
  await loginAs(managerPage, manager.email, manager.password);
  await managerPage.goto("/refunds");

  const expensiveRequestRow = managerPage
    .getByTestId("refund-request-row")
    .filter({ hasText: expensiveReason });
  await expect(expensiveRequestRow).toBeVisible({ timeout: 10_000 });
  await expensiveRequestRow.getByRole("button", { name: "อนุมัติ" }).click();
  await expect(expensiveRequestRow).toBeHidden({ timeout: 20_000 });
  await managerPage.close();

  // Audit trail (D5): both reversals recorded who approved them, distinct
  // from who created the original sale.
  const { prisma } = await import("@/lib/prisma");
  const reversals = await prisma.salesTransaction.findMany({
    where: { approvedBy: { in: [shiftSupervisor.id, manager.id] } },
    select: { approvedBy: true, cashierId: true, reversalOfId: true },
  });
  expect(reversals.length).toBeGreaterThanOrEqual(2);
  for (const r of reversals) {
    expect(r.reversalOfId).not.toBeNull();
    expect(r.approvedBy).not.toBe(r.cashierId);
  }
});
