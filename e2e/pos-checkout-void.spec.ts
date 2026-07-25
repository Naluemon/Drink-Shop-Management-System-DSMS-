import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import {
  createTestMenu,
  deleteTestMenu,
  getIngredientStock,
  type TestMenu,
} from "./helpers/test-data";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "ขายผ่าน POS ... สต็อกลดตามจริง ... dashboard ตัวเลขอัปเดต" +
// TC-VOID-01 ("Void รายการในกะเดียวกัน → สต็อกคืน, ยอดขายลด"). Uses a
// disposable Shift Supervisor + a disposable single-ingredient menu (see
// e2e/helpers/*), cleaned up in afterAll. Recipe consumes 10g of the test
// ingredient per sale (createTestMenu's fixture), starting stock 1000g.
// Shift Supervisor (not Cashier) so one user can both sell/void at POS *and*
// view the Dashboard in the same flow — per lib/permissions.ts's matrix,
// Cashier has no "view" on the dashboard resource at all.
let shiftSupervisor: TestUser;
let testMenu: TestMenu;

test.beforeAll(async () => {
  shiftSupervisor = await createTestUser("shift_supervisor");
  testMenu = await createTestMenu(shiftSupervisor.id);
});

test.afterAll(async () => {
  await deleteTestMenu(testMenu);
  await deleteTestUser(shiftSupervisor);
});

test("Shift Supervisor sells the test menu at POS: stock decrements and dashboard revenue increases; voiding restores both", async ({
  page,
}) => {
  const stockBeforeSale = await getIngredientStock(testMenu.ingredientId);

  // Snapshot today's dashboard revenue before the sale, to assert a delta
  // rather than an absolute number — this DB has other concurrent activity
  // (mock/perf seed data), so only the *change* is a reliable signal.
  await loginAs(page, shiftSupervisor.email, shiftSupervisor.password);
  await page.goto("/dashboard");
  const revenueBefore = await readTodayRevenue(page);

  await page.goto("/pos");

  // FR-POS-01: direct tap, no search — single ingredient, no variant/modifier
  await page.getByRole("button", { name: new RegExp(testMenu.menuName) }).click();
  await page.getByRole("button", { name: "ยืนยันการขาย" }).click();

  // Receipt overlay confirms the sale went through — scoped to the overlay
  // itself since the menu tile behind it also shows "20.00 บาท".
  const receiptOverlay = page.locator(".fixed.inset-0");
  await expect(receiptOverlay.getByText("ขายสำเร็จ")).toBeVisible({ timeout: 15_000 });
  await expect(receiptOverlay.getByText("20.00 บาท")).toBeVisible();

  // Stock ledger: recipe consumes 10g per sale (TESTING.md §5 "สต็อกลดตามจริง")
  await expect
    .poll(() => getIngredientStock(testMenu.ingredientId), { timeout: 10_000 })
    .toBe(stockBeforeSale - 10);

  // Dashboard: today's revenue reflects the ฿20 sale
  await page.goto("/dashboard");
  await expect
    .poll(async () => readTodayRevenue(page), { timeout: 10_000 })
    .toBeCloseTo(revenueBefore + 20, 2);

  // Reload so the server refetches the recent-transactions list with the new sale
  await page.goto("/pos");
  await page.reload();

  const firstRow = page.getByTestId("recent-transaction-row").first();
  await expect(firstRow).toContainText("20.00 บาท");
  await firstRow.getByRole("button", { name: "ยกเลิก (Void)" }).click();

  await page.getByPlaceholder("เช่น ลูกค้าเปลี่ยนใจ / กดผิด").fill("E2E test void");
  await page.getByRole("button", { name: "ยืนยันยกเลิก" }).click();

  await expect(firstRow.getByText("ยกเลิกแล้ว")).toBeVisible({ timeout: 15_000 });

  // TC-VOID-01: void restores stock and reduces the day's sales back down
  await expect
    .poll(() => getIngredientStock(testMenu.ingredientId), { timeout: 10_000 })
    .toBe(stockBeforeSale);

  await page.goto("/dashboard");
  await expect
    .poll(async () => readTodayRevenue(page), { timeout: 10_000 })
    .toBeCloseTo(revenueBefore, 2);
});

// The "วันนี้" revenue KPI card's value — see features/dashboard/components/
// dashboard-content.tsx. Parses the thousands-separated formatBaht() text
// (e.g. "1,234.50 บาท") back into a number for delta comparisons.
async function readTodayRevenue(page: import("@playwright/test").Page): Promise<number> {
  const card = page.getByTestId("kpi-revenue-today");
  const text = await card.innerText();
  const match = text.replace(/,/g, "").match(/[\d.]+/);
  if (!match) throw new Error(`Could not parse revenue from "${text}"`);
  return Number(match[0]);
}
