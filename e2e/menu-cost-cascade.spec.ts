import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import {
  createTestModifierGroup,
  deleteTestModifierGroup,
  deleteMenuChain,
  type TestModifierGroup,
} from "./helpers/test-data";
import { loginAs } from "./helpers/login";

// TESTING.md §5: "สร้าง ingredient (พร้อม unit conversion) → สร้าง recipe →
// สร้าง menu พร้อม variant/modifier → cost คำนวณถูกต้องตลอด chain". Drives
// the real create-then-edit-to-attach-children flow (unit conversions,
// recipe ingredients, variants, and modifier attachment are all edit-mode-only
// UI, see ingredient/recipe/menu-form-dialog.tsx) end to end as Owner, then
// asserts the Cost Preview panel's live numbers.
//
// The modifier group's own ingredient is a disposable Prisma fixture (see
// e2e/helpers/test-data.ts) — attaching/toggling an existing modifier is
// what's under test here, not re-deriving its ingredient-cost math (already
// covered exactly in lib/cost-formulas.test.ts).
let owner: TestUser;
let modifierFixture: TestModifierGroup;
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const ingredientName = `E2E วัตถุดิบหลัก ${suffix}`;
const recipeName = `E2E สูตรหลัก ${suffix}`;
const menuName = `E2E เมนูหลัก ${suffix}`;

test.beforeAll(async () => {
  owner = await createTestUser("owner");
  // modifier cost = 10g × 3 บาท/g = 30 บาท, priceDelta +15
  modifierFixture = await createTestModifierGroup(owner.id, 3, 10, 15);
});

test.afterAll(async () => {
  // The test drives real create-then-edit UI flows rather than a Prisma
  // fixture, so there are no ids to carry forward — look everything up by
  // its unique (suffixed) name instead.
  const menu = await prisma.menu.findFirst({
    where: { name: menuName },
    include: { variants: true },
  });
  const recipe = await prisma.recipe.findFirst({ where: { name: recipeName } });
  const ingredient = await prisma.ingredient.findFirst({ where: { name: ingredientName } });

  await deleteMenuChain({
    menuId: menu?.id,
    variantIds: menu?.variants.map((v) => v.id) ?? [],
    recipeId: recipe?.id,
    ingredientId: ingredient?.id,
  });
  await deleteTestModifierGroup(modifierFixture);
  await deleteTestUser(owner);
});

test("Owner builds ingredient→recipe→menu with variant+modifier, cost preview computes correctly", async ({
  page,
}) => {
  await loginAs(page, owner.email, owner.password);

  // ── Ingredient (2 บาท/gram) + unit conversion ──────────────────────────
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "เพิ่มวัตถุดิบ" }).click();
  await page.locator("#ing-name").fill(ingredientName);
  await page.locator("#ing-cost").fill("2");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

  const ingredientRow = page.locator("tr", { hasText: ingredientName });
  await expect(ingredientRow).toBeVisible();
  await ingredientRow.getByRole("button", { name: "แก้ไข" }).click();
  await page.getByPlaceholder("กล่อง 946ml").fill("ถุง 500g");
  await page.getByLabel(/= กี่กรัม/).fill("500");
  await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await expect(page.getByText("1 ถุง 500g = 500 กรัม")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  // ── Recipe: 50g of the ingredient, yield 1 → cost = 50×2 = 100 บาท ─────
  await page.goto("/recipes");
  await page.getByRole("button", { name: "เพิ่มสูตร" }).click();
  await page.locator("#rcp-name").fill(recipeName);
  await page.locator("#rcp-yield").fill("1");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

  const recipeRow = page.locator("tr", { hasText: recipeName });
  await expect(recipeRow).toBeVisible();
  await recipeRow.getByRole("button", { name: "แก้ไข" }).click();
  await page.getByLabel("วัตถุดิบ").click();
  await page.getByRole("option", { name: new RegExp(ingredientName) }).click();
  await page.getByLabel(/ปริมาณ/).fill("50");
  await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await expect(page.getByText(`${ingredientName} — 50 กรัม`)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(recipeRow).toContainText("100.00 บาท");

  // ── Menu: basePrice 100, recipe = the one above ────────────────────────
  await page.goto("/menus");
  await page.getByRole("button", { name: "เพิ่มเมนู" }).click();
  await page.locator("#menu-name").fill(menuName);
  await page.getByLabel("สูตรหลัก").click();
  await page.getByRole("option", { name: new RegExp(recipeName) }).click();
  await page.locator("#menu-price").fill("100");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

  const menuRow = page.locator("tr", { hasText: menuName });
  await expect(menuRow).toBeVisible();
  await menuRow.getByRole("button", { name: "แก้ไข" }).click();

  // Variant "L": ×1.5 multiplier, +20 บาท → variant cost = 100×1.5 = 150 บาท
  await page.getByPlaceholder("Size L").fill("L");
  await page.getByLabel("ส่วนต่างราคา (บาท)").fill("20");
  await page.getByLabel("ตัวคูณสูตรหลัก").fill("1.5");
  await page.getByRole("button", { name: "เพิ่ม variant" }).click();
  await expect(page.getByText("(×1.5) +20 บาท")).toBeVisible({ timeout: 10_000 });

  // Attach the pre-seeded modifier group
  await page.getByLabel(modifierFixture.groupName).check();
  await expect(page.getByText(modifierFixture.modifierName)).toBeVisible({ timeout: 10_000 });

  // ── Cost Preview: select variant L + the modifier ──────────────────────
  await page.getByLabel("Variant", { exact: true }).click();
  await page.getByRole("option", { name: "L", exact: true }).click();
  await page.getByLabel(modifierFixture.modifierName).check();

  // totalCost = variantCost(150) + modifierCost(30) = 180
  // sellingPrice = basePrice(100) + variant priceDelta(20) = 120 (modifier
  // priceDelta is not part of sellingPrice — see cost-preview.tsx)
  // margin = 120 - 180 = -60
  await expect(page.getByText("ต้นทุนรวม")).toBeVisible();
  await expect(page.getByText("180.00 บาท")).toBeVisible();
  await expect(page.getByText("120.00 บาท")).toBeVisible();
  await expect(page.getByText("-60.00 บาท")).toBeVisible();
});
