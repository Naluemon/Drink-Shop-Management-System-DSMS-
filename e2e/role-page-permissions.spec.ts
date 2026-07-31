import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { loginAs } from "./helpers/login";
import { prisma } from "@/lib/prisma";

const createdUsers: TestUser[] = [];

async function userFor(role: TestUser["role"]): Promise<TestUser> {
  const user = await createTestUser(role);
  createdUsers.push(user);
  return user;
}

test.afterAll(async () => {
  for (const user of createdUsers) {
    await deleteTestUser(user);
  }
  // Restore the default (accountant can reach reports) so this test doesn't
  // leak state into auth-rbac.spec.ts or any later run of this file.
  await prisma.rolePagePermission.upsert({
    where: { role_pageKey: { role: "accountant", pageKey: "reports" } },
    create: { role: "accountant", pageKey: "reports", allowed: true },
    update: { allowed: true },
  });
});

test("owner disabling a page for a role takes effect immediately for that role", async ({
  page,
  browser,
}) => {
  const owner = await userFor("owner");
  const accountant = await userFor("accountant");

  await loginAs(page, owner.email, owner.password);
  await page.goto("/users");

  const accountantReportsCheckbox = page.getByRole("checkbox", { name: "ฝ่ายบัญชี - รายงาน" });
  await accountantReportsCheckbox.uncheck();
  // The permission grid (moved here from Settings) has its own "บันทึก"
  // (Save) button — scope to the grid's own wrapper so the click can't hit
  // some other button on the page.
  const gridRoot = page.locator("div.space-y-3").filter({ has: accountantReportsCheckbox });
  await gridRoot.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByText("บันทึกสำเร็จ")).toBeVisible();

  const accountantContext = await browser.newContext();
  const accountantPage = await accountantContext.newPage();
  await loginAs(accountantPage, accountant.email, accountant.password);

  // Disabled sidebar items render without a link role (see app-shell.tsx).
  await expect(accountantPage.getByRole("link", { name: "รายงาน" })).toHaveCount(0);

  await accountantPage.goto("/reports");
  await expect(accountantPage).toHaveURL(/\/dashboard$/);

  await accountantContext.close();
});
