import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  deleteUserByEmail,
  type TestUser,
} from "./helpers/test-users";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "Signup คนแรก → ได้ Owner, Invite พนักงานใหม่แต่ละ role →
// login ผ่านลิงก์เชิญสำเร็จ".
//
// "First signup becomes Owner" is NOT covered here — DECISIONS.md D6's
// bootstrap check is `ownerCount === 0` (features/auth/actions/bootstrap.ts),
// and this shared dev database already has a real Owner. Testing that path
// would require either deleting/renaming a real account or an empty test
// database, neither of which is available — the logic itself is already
// covered by features/auth/actions/bootstrap.test.ts (mocked Prisma).
//
// What IS safely testable without touching real data:
// 1. /setup redirects away once an Owner exists (the page-level guard that
//    makes bootstrap unreachable after the first signup).
// 2. The full invite → accept → login cycle, for every invitable role.
const TEST_PASSWORD = "E2eInvitePass1!";

let owner: TestUser;
const invitedEmails: string[] = [];

test.beforeAll(async () => {
  owner = await createTestUser("owner");
});

test.afterAll(async () => {
  for (const email of invitedEmails) {
    await deleteUserByEmail(email);
  }
  await deleteTestUser(owner);
});

test("/setup redirects away once an Owner already exists (D6 bootstrap guard)", async ({
  page,
}) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$/);
});

// DECISIONS.md D14: Owner may invite any of the 6 roles.
const INVITABLE_ROLES: { value: string; label: string }[] = [
  { value: "owner", label: "เจ้าของร้าน (Owner)" },
  { value: "manager", label: "ผู้จัดการ (Manager)" },
  { value: "shift_supervisor", label: "หัวหน้ากะ (Shift Supervisor)" },
  { value: "cashier", label: "แคชเชียร์ (Cashier)" },
  { value: "employee", label: "พนักงาน (Employee)" },
  { value: "accountant", label: "ฝ่ายบัญชี (Accountant)" },
];

for (const role of INVITABLE_ROLES) {
  test(`Owner invites a ${role.value}, who accepts via the invite link and can log in`, async ({
    page,
    browser,
  }) => {
    const email = `e2e-invite-${role.value}-${Date.now()}@e2e-test.local`;
    invitedEmails.push(email);

    // Owner sends the invite from the real Users page UI.
    await loginAs(page, owner.email, owner.password);
    await page.goto("/users");
    await page.getByRole("button", { name: "เชิญผู้ใช้ใหม่" }).click();
    await page.locator("#invite-email").fill(email);
    await page.getByLabel("บทบาท").click();
    await page.getByRole("option", { name: role.label }).click();
    await page.getByRole("button", { name: "ส่งคำเชิญ" }).click();

    const linkBox = page.locator(".bg-muted.rounded-lg.p-3.text-xs.break-all");
    await expect(linkBox).toBeVisible({ timeout: 10_000 });
    const inviteLink = await linkBox.innerText();
    const token = new URL(inviteLink).searchParams.get("token");
    expect(token).toBeTruthy();

    // Accept the invite in a fresh, unauthenticated browser context — this
    // is the invited person, not the Owner.
    const acceptPage = await (await browser.newContext()).newPage();
    await acceptPage.goto(`/invite/accept?token=${token}`);
    await expect(acceptPage.getByText(email)).toBeVisible();

    // DECISIONS.md D15: Privacy Notice gate before the password form appears.
    await acceptPage.getByRole("checkbox").check();
    await acceptPage.getByRole("button", { name: "ยอมรับและดำเนินการต่อ" }).click();

    await acceptPage.locator("#password").fill(TEST_PASSWORD);
    await acceptPage.locator("#confirmPassword").fill(TEST_PASSWORD);
    await acceptPage.getByRole("button", { name: "สร้างบัญชี" }).click();
    await acceptPage.waitForURL("**/dashboard", { timeout: 15_000 });
    await acceptPage.close();

    // Independently confirm the account can log in fresh (not just carry
    // the session acceptInvite() created) — a completely new context.
    const freshLoginPage = await (await browser.newContext()).newPage();
    await loginAs(freshLoginPage, email, TEST_PASSWORD);
    await expect(freshLoginPage).toHaveURL(/\/dashboard$/);
    await freshLoginPage.close();
  });
}
