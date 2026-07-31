import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { loginAs } from "./helpers/login";
import { prisma } from "@/lib/prisma";

const createdUsers: TestUser[] = [];
let existingIngredientName: string;

test.beforeAll(async () => {
  existingIngredientName = `e2e-existing-${Date.now()}`;
  const branch = await prisma.branch.findFirstOrThrow();
  await prisma.ingredient.create({
    data: {
      branchId: branch.id,
      name: existingIngredientName,
      baseUnit: "gram",
      costPerUnit: 1,
      createdBy: (await prisma.user.findFirstOrThrow()).id,
    },
  });
});

test.afterAll(async () => {
  for (const user of createdUsers) {
    await deleteTestUser(user);
  }
  await prisma.inventoryMovement.deleteMany({
    where: { ingredient: { name: existingIngredientName } },
  });
  await prisma.ingredient.deleteMany({ where: { name: existingIngredientName } });
  await prisma.inventoryMovement.deleteMany({
    where: { ingredient: { name: { startsWith: "e2e-new-" } } },
  });
  await prisma.ingredient.deleteMany({ where: { name: { startsWith: "e2e-new-" } } });
});

test("owner imports a file: new ingredient with starting stock is created, duplicate row is skipped", async ({
  page,
}) => {
  const owner = await createTestUser("owner");
  createdUsers.push(owner);

  const newIngredientName = `e2e-new-${Date.now()}`;
  const csvContent = [
    "ชื่อวัตถุดิบ,หน่วยฐาน,ต้นทุนต่อหน่วย,สต็อกเริ่มต้น,จุดแจ้งเตือนสต็อกต่ำ,ผู้จำหน่าย,ชื่อหน่วยซื้อ,อัตราแปลงหน่วยซื้อ",
    `${newIngredientName},กรัม,15,50,,,,`,
    `${existingIngredientName},กรัม,1,0,,,,`,
  ].join("\n");

  await loginAs(page, owner.email, owner.password);
  await page.goto("/ingredients");

  await page.getByRole("button", { name: "นำเข้าไฟล์" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "test-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent, "utf8"),
  });

  await expect(page.getByText("จะสร้างวัตถุดิบใหม่ 1 รายการ")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`แถวที่ 3: ${existingIngredientName}`)).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "ยืนยันนำเข้า" }).click();
  await expect(page.getByText("นำเข้าสำเร็จ 1 รายการ")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(newIngredientName)).toBeVisible({ timeout: 10_000 });
  const created = await prisma.ingredient.findFirstOrThrow({
    where: { name: newIngredientName },
  });
  expect(created.currentStockQty.toString()).toBe("50");

  const movement = await prisma.inventoryMovement.findFirst({
    where: { ingredientId: created.id, movementType: "stock_in" },
  });
  expect(movement).not.toBeNull();
});
