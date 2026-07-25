import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "Login → เข้าไม่ถึงหน้าที่ไม่มีสิทธิ์ (ทดสอบครบทั้ง 6 role)".
// One disposable Supabase Auth + public.users row per role, created before
// the suite and deleted after — see e2e/helpers/test-users.ts.
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
});

test("Owner can reach Settings (Owner-only per SECURITY.md §1)", async ({ page }) => {
  const owner = await userFor("owner");
  await loginAs(page, owner.email, owner.password);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "ตั้งค่าระบบ" })).toBeVisible();
});

test("Manager is denied Settings (redirected to Dashboard)", async ({ page }) => {
  const manager = await userFor("manager");
  await loginAs(page, manager.email, manager.password);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Shift Supervisor can reach POS but is denied Settings", async ({ page }) => {
  const shiftSupervisor = await userFor("shift_supervisor");
  await loginAs(page, shiftSupervisor.email, shiftSupervisor.password);

  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos$/);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Cashier can reach POS but is denied Inventory", async ({ page }) => {
  const cashier = await userFor("cashier");
  await loginAs(page, cashier.email, cashier.password);

  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos$/);

  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Employee can reach Inventory but is denied POS", async ({ page }) => {
  const employee = await userFor("employee");
  await loginAs(page, employee.email, employee.password);

  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/inventory$/);

  await page.goto("/pos");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Accountant can reach Expenses but is denied POS and Inventory entirely (D14, TC-RBAC-01)", async ({
  page,
}) => {
  const accountant = await userFor("accountant");
  await loginAs(page, accountant.email, accountant.password);

  await page.goto("/expenses");
  await expect(page).toHaveURL(/\/expenses$/);

  await page.goto("/pos");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/dashboard$/);
});
