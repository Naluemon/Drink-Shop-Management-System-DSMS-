import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { createTestMenu, deleteTestMenu, type TestMenu } from "./helpers/test-data";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "ขายผ่าน POS ... สต็อกลดตามจริง" + TC-VOID-01 ("Void รายการใน
// กะเดียวกัน → สต็อกคืน, ยอดขายลด"). Uses a disposable cashier + a disposable
// single-ingredient menu (see e2e/helpers/*), cleaned up in afterAll.
let cashier: TestUser;
let testMenu: TestMenu;

test.beforeAll(async () => {
  cashier = await createTestUser("cashier");
  testMenu = await createTestMenu(cashier.id);
});

test.afterAll(async () => {
  await deleteTestMenu(testMenu);
  await deleteTestUser(cashier);
});

test("Cashier sells the test menu at POS, stock decrements, then voids it and stock is restored", async ({
  page,
}) => {
  await loginAs(page, cashier.email, cashier.password);
  await page.goto("/pos");

  // FR-POS-01: direct tap, no search — single ingredient, no variant/modifier
  await page.getByRole("button", { name: new RegExp(testMenu.menuName) }).click();
  await page.getByRole("button", { name: "ยืนยันการขาย" }).click();

  // Receipt overlay confirms the sale went through
  await expect(page.getByText("ขายสำเร็จ")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("20.00 บาท")).toBeVisible();

  // Reload so the server refetches the recent-transactions list with the new sale
  await page.reload();

  const firstRow = page.locator(".border-border\\/60").first();
  await expect(firstRow).toContainText("20.00 บาท");
  await firstRow.getByRole("button", { name: "ยกเลิก (Void)" }).click();

  await page.getByPlaceholder("เช่น ลูกค้าเปลี่ยนใจ / กดผิด").fill("E2E test void");
  await page.getByRole("button", { name: "ยืนยันยกเลิก" }).click();

  await expect(firstRow.getByText("ยกเลิกแล้ว")).toBeVisible({ timeout: 15_000 });
});
