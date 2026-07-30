// One-off/rerunnable mock-data generator for manual CRUD testing (not part of
// the automated test suite). Tops up every module to ~10 sample rows so every
// list/detail page in the app has something real to click through. Safe to
// rerun — each section only adds rows up to its target count, it never
// deletes or duplicates past that target.
//
// Usage: npx tsx prisma/seed-mock.ts
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { calculateVariantCost, calculateModifierCost } from "@/lib/cost-cascade";
import type {
  BaseUnit,
  ModifierSelectionType,
  PaymentMethod,
  PurchaseOrderStatus,
  VatMode,
} from "@/lib/generated/prisma/enums";

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

async function main() {
  const branch = await prisma.branch.findFirstOrThrow();
  const branchId = branch.id;
  const organizationId = branch.organizationId;

  const users = await prisma.user.findMany();
  const byRole = (role: string) => users.find((u) => u.role === role) ?? users[0];
  const owner = byRole("owner");
  const manager = byRole("manager");
  const shiftSupervisor = byRole("shift_supervisor");
  const cashier = byRole("cashier");
  const employee = byRole("employee");
  const accountant = byRole("accountant");

  const taxSettings = await prisma.taxSettings.findFirstOrThrow();

  // ------------------------------------------------------------------
  // Suppliers (target 10)
  // ------------------------------------------------------------------
  const supplierNames = [
    "ร้านวัตถุดิบชาไทยไทเป",
    "บริษัท นมสด ไทย-เดนมาร์ค จำกัด",
    "ร้านน้ำเชื่อมรวมทิพย์",
    "ซัพพลายเออร์แก้ว-หลอด กรุงเทพ",
    "ร้านกาแฟคั่วบ้านไร่",
    "บริษัท ผลไม้สดออร์แกนิค จำกัด",
    "ร้านชาเขียวมัทฉะเกียวโต",
    "ซัพพลายเออร์นมข้นหวานตราหมี",
    "ร้านน้ำผึ้งแท้เชียงใหม่",
    "บริษัท บรรจุภัณฑ์อีโค่แพ็ค จำกัด",
  ];
  const suppliers = await prisma.supplier.findMany();
  for (let i = suppliers.length; i < 10; i++) {
    const s = await prisma.supplier.create({
      data: {
        branchId,
        name: supplierNames[i],
        contactInfo: `09${(10000000 + i * 111111).toString().slice(0, 8)} / line:@supplier${i + 1}`,
        createdBy: owner.id,
      },
    });
    suppliers.push(s);
  }

  // ------------------------------------------------------------------
  // Ingredients (target 10) — realistic Thai drink-shop wholesale pricing
  // ------------------------------------------------------------------
  const ingredientDefs: {
    name: string;
    baseUnit: BaseUnit;
    purchaseUnitName: string;
    purchasePrice: number;
    conversionFactor: number;
    lowStockThreshold: number;
    initialStock: number;
  }[] = [
    {
      name: "นมสด UHT",
      baseUnit: "ml",
      purchaseUnitName: "กล่อง 946ml",
      purchasePrice: 52.5,
      conversionFactor: 946,
      lowStockThreshold: 2000,
      initialStock: 9460,
    },
    {
      name: "ผงชาไทย",
      baseUnit: "gram",
      purchaseUnitName: "ถุง 200g",
      purchasePrice: 95,
      conversionFactor: 200,
      lowStockThreshold: 500,
      initialStock: 2000,
    },
    {
      name: "น้ำเชื่อม",
      baseUnit: "ml",
      purchaseUnitName: "ขวด 750ml",
      purchasePrice: 40,
      conversionFactor: 750,
      lowStockThreshold: 1500,
      initialStock: 7500,
    },
    {
      name: "ไข่มุก (ไทเปียก้า)",
      baseUnit: "gram",
      purchaseUnitName: "ถุง 1000g",
      purchasePrice: 70,
      conversionFactor: 1000,
      lowStockThreshold: 1000,
      initialStock: 5000,
    },
    {
      name: "แก้ว+ฝา+หลอด (16oz)",
      baseUnit: "piece",
      purchaseUnitName: "แพ็ค 50 ชุด",
      purchasePrice: 90,
      conversionFactor: 50,
      lowStockThreshold: 100,
      initialStock: 500,
    },
    {
      name: "กาแฟคั่วบด",
      baseUnit: "gram",
      purchaseUnitName: "ถุง 1000g",
      purchasePrice: 380,
      conversionFactor: 1000,
      lowStockThreshold: 500,
      initialStock: 3000,
    },
    {
      name: "ผงมัทฉะ",
      baseUnit: "gram",
      purchaseUnitName: "กระป๋อง 500g",
      purchasePrice: 650,
      conversionFactor: 500,
      lowStockThreshold: 200,
      initialStock: 1500,
    },
    {
      name: "ผงโกโก้",
      baseUnit: "gram",
      purchaseUnitName: "ถุง 1000g",
      purchasePrice: 220,
      conversionFactor: 1000,
      lowStockThreshold: 300,
      initialStock: 2500,
    },
    {
      name: "นมข้นหวาน",
      baseUnit: "ml",
      purchaseUnitName: "กระป๋อง 385ml",
      purchasePrice: 28,
      conversionFactor: 385,
      lowStockThreshold: 1000,
      initialStock: 3850,
    },
    {
      name: "น้ำผึ้งแท้",
      baseUnit: "ml",
      purchaseUnitName: "ขวด 700ml",
      purchasePrice: 180,
      conversionFactor: 700,
      lowStockThreshold: 700,
      initialStock: 2100,
    },
    // Food (อาหาร) — same Ingredient→Recipe→Menu chain, just gram/piece instead of ml
    {
      name: "หมูสับ",
      baseUnit: "gram",
      purchaseUnitName: "กิโลกรัม",
      purchasePrice: 130,
      conversionFactor: 1000,
      lowStockThreshold: 500,
      initialStock: 3000,
    },
    {
      name: "วุ้นเส้น",
      baseUnit: "gram",
      purchaseUnitName: "ห่อ 500g",
      purchasePrice: 45,
      conversionFactor: 500,
      lowStockThreshold: 300,
      initialStock: 2000,
    },
    {
      name: "มาม่า",
      baseUnit: "piece",
      purchaseUnitName: "แพ็ค 30 ซอง",
      purchasePrice: 180,
      conversionFactor: 30,
      lowStockThreshold: 20,
      initialStock: 100,
    },
    {
      name: "ไข่ไก่",
      baseUnit: "piece",
      purchaseUnitName: "แผง 30 ฟอง",
      purchasePrice: 120,
      conversionFactor: 30,
      lowStockThreshold: 30,
      initialStock: 150,
    },
    {
      name: "ถั่วลิสง",
      baseUnit: "gram",
      purchaseUnitName: "ถุง 500g",
      purchasePrice: 60,
      conversionFactor: 500,
      lowStockThreshold: 200,
      initialStock: 1500,
    },
  ];

  const ingredients = await prisma.ingredient.findMany({ include: { unitConversions: true } });
  const existingNames = new Set(ingredients.map((i) => i.name));
  for (const def of ingredientDefs) {
    // Named-lookup targets (recipes reference these by exact name below) —
    // always ensure all defs exist rather than stopping at a row count, so a
    // pre-existing unrelated row never leaves a def missing.
    if (existingNames.has(def.name)) continue;
    const costPerUnit = def.purchasePrice / def.conversionFactor;
    const ing = await prisma.ingredient.create({
      data: {
        branchId,
        name: def.name,
        baseUnit: def.baseUnit,
        costPerUnit,
        currentStockQty: def.initialStock,
        lowStockThreshold: def.lowStockThreshold,
        supplierId: rand(suppliers).id,
        createdBy: owner.id,
        unitConversions: {
          create: {
            purchaseUnitName: def.purchaseUnitName,
            conversionFactor: def.conversionFactor,
          },
        },
      },
      include: { unitConversions: true },
    });
    ingredients.push(ing);
  }
  const byName = (name: string) => ingredients.find((i) => i.name === name)!;

  // ------------------------------------------------------------------
  // Recipes (target 10), yield = 1 แก้ว
  // ------------------------------------------------------------------
  type RecipeDef = { name: string; items: { name: string; quantity: number }[] };
  const recipeDefs: RecipeDef[] = [
    {
      name: "ชาไทยเย็น",
      items: [
        { name: "ผงชาไทย", quantity: 20 },
        { name: "นมสด UHT", quantity: 60 },
        { name: "น้ำเชื่อม", quantity: 30 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "ชาเขียวมัทฉะลาเต้เย็น",
      items: [
        { name: "ผงมัทฉะ", quantity: 15 },
        { name: "นมสด UHT", quantity: 100 },
        { name: "น้ำเชื่อม", quantity: 20 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "กาแฟเย็น",
      items: [
        { name: "กาแฟคั่วบด", quantity: 18 },
        { name: "นมข้นหวาน", quantity: 30 },
        { name: "น้ำเชื่อม", quantity: 15 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "ลาเต้เย็น",
      items: [
        { name: "กาแฟคั่วบด", quantity: 18 },
        { name: "นมสด UHT", quantity: 120 },
        { name: "น้ำเชื่อม", quantity: 15 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "โกโก้เย็น",
      items: [
        { name: "ผงโกโก้", quantity: 25 },
        { name: "นมสด UHT", quantity: 100 },
        { name: "น้ำเชื่อม", quantity: 20 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "ชานมไข่มุก",
      items: [
        { name: "ผงชาไทย", quantity: 20 },
        { name: "นมสด UHT", quantity: 80 },
        { name: "น้ำเชื่อม", quantity: 20 },
        { name: "ไข่มุก (ไทเปียก้า)", quantity: 30 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "ชามะนาว",
      items: [
        { name: "ผงชาไทย", quantity: 15 },
        { name: "น้ำเชื่อม", quantity: 35 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "น้ำผึ้งมะนาวโซดา",
      items: [
        { name: "น้ำผึ้งแท้", quantity: 30 },
        { name: "น้ำเชื่อม", quantity: 10 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "มัทฉะปั่น",
      items: [
        { name: "ผงมัทฉะ", quantity: 20 },
        { name: "นมสด UHT", quantity: 90 },
        { name: "น้ำเชื่อม", quantity: 25 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    {
      name: "กาแฟปั่น",
      items: [
        { name: "กาแฟคั่วบด", quantity: 22 },
        { name: "นมข้นหวาน", quantity: 40 },
        { name: "นมสด UHT", quantity: 60 },
        { name: "แก้ว+ฝา+หลอด (16oz)", quantity: 1 },
      ],
    },
    // Food (อาหาร) — yield 1 จาน
    {
      name: "ยำวุ้นเส้น",
      items: [
        { name: "วุ้นเส้น", quantity: 80 },
        { name: "หมูสับ", quantity: 60 },
        { name: "ถั่วลิสง", quantity: 15 },
      ],
    },
    {
      name: "ยำมาม่า",
      items: [
        { name: "มาม่า", quantity: 1 },
        { name: "หมูสับ", quantity: 50 },
        { name: "ถั่วลิสง", quantity: 15 },
      ],
    },
    { name: "ไข่เจียว", items: [{ name: "ไข่ไก่", quantity: 2 }] },
    { name: "ไข่ดาว", items: [{ name: "ไข่ไก่", quantity: 1 }] },
  ];

  const recipes = await prisma.recipe.findMany({
    include: { ingredients: { include: { ingredient: true } } },
  });
  const existingRecipeNames = new Set(recipes.map((r) => r.name));
  for (const def of recipeDefs) {
    // Menus below reference these by exact name — ensure every def exists.
    if (existingRecipeNames.has(def.name)) continue;
    const recipe = await prisma.recipe.create({
      data: {
        branchId,
        name: def.name,
        yield: 1,
        createdBy: owner.id,
        ingredients: {
          create: def.items.map((it) => ({
            ingredientId: byName(it.name).id,
            quantity: it.quantity,
          })),
        },
      },
      include: { ingredients: { include: { ingredient: true } } },
    });
    recipes.push(recipe);
  }
  const recipeByName = (name: string) => recipes.find((r) => r.name === name)!;

  // ------------------------------------------------------------------
  // Menu categories (target 6 — a lookup grouping, not a 10-row list)
  // ------------------------------------------------------------------
  const categoryNames = [
    "เครื่องดื่มยอดนิยม",
    "ชา",
    "กาแฟ",
    "นมสด",
    "โซดา/น้ำผลไม้",
    "ปั่น",
    "อาหาร",
  ];
  const categories = await prisma.menuCategory.findMany();
  const existingCatNames = new Set(categories.map((c) => c.name));
  for (const name of categoryNames) {
    // Named-lookup target (menus below reference "อาหาร" by exact name) —
    // ensure every def exists rather than stopping at a row count.
    if (existingCatNames.has(name)) continue;
    categories.push(
      await prisma.menuCategory.create({ data: { branchId, name, createdBy: owner.id } }),
    );
  }

  // ------------------------------------------------------------------
  // Menus (target 10) + variants S/M/L per menu
  // ------------------------------------------------------------------
  type MenuDef = { name: string; recipe: string; category: string; basePrice: number };
  const menuDefs: MenuDef[] = [
    { name: "ชาไทยเย็น", recipe: "ชาไทยเย็น", category: "เครื่องดื่มยอดนิยม", basePrice: 35 },
    { name: "มัทฉะลาเต้เย็น", recipe: "ชาเขียวมัทฉะลาเต้เย็น", category: "ชา", basePrice: 55 },
    { name: "กาแฟเย็น", recipe: "กาแฟเย็น", category: "กาแฟ", basePrice: 40 },
    { name: "ลาเต้เย็น", recipe: "ลาเต้เย็น", category: "กาแฟ", basePrice: 50 },
    { name: "โกโก้เย็น", recipe: "โกโก้เย็น", category: "นมสด", basePrice: 45 },
    { name: "ชานมไข่มุก", recipe: "ชานมไข่มุก", category: "เครื่องดื่มยอดนิยม", basePrice: 45 },
    { name: "ชามะนาว", recipe: "ชามะนาว", category: "โซดา/น้ำผลไม้", basePrice: 35 },
    {
      name: "น้ำผึ้งมะนาวโซดา",
      recipe: "น้ำผึ้งมะนาวโซดา",
      category: "โซดา/น้ำผลไม้",
      basePrice: 40,
    },
    { name: "มัทฉะปั่น", recipe: "มัทฉะปั่น", category: "ปั่น", basePrice: 60 },
    { name: "กาแฟปั่น", recipe: "กาแฟปั่น", category: "ปั่น", basePrice: 55 },
  ];

  const menus = await prisma.menu.findMany({ include: { variants: true } });
  const existingMenuNames = new Set(menus.map((m) => m.name));
  for (const def of menuDefs) {
    if (existingMenuNames.has(def.name)) continue;
    if (menus.length >= 10) break;
    const category = categories.find((c) => c.name === def.category) ?? categories[0];
    const menu = await prisma.menu.create({
      data: {
        branchId,
        categoryId: category.id,
        recipeId: recipeByName(def.recipe).id,
        name: def.name,
        basePrice: def.basePrice,
        isAvailable: true,
        createdBy: owner.id,
        variants: {
          create: [
            { name: "S", recipeMultiplier: 0.8, priceDelta: -5, isDefault: false },
            { name: "M", recipeMultiplier: 1, priceDelta: 0, isDefault: true },
            { name: "L", recipeMultiplier: 1.3, priceDelta: 10, isDefault: false },
          ],
        },
      },
      include: { variants: true },
    });
    menus.push(menu);
  }

  // ------------------------------------------------------------------
  // Food menus — no S/M/L variants (doesn't apply to a plate of food).
  // Kept out of menuDefs/menus-driven "appliesTo: menuDefs.map(...)" groups
  // below on purpose, so ความหวาน/น้ำแข็ง never attach to a plate of ยำ.
  // ------------------------------------------------------------------
  const foodMenuDefs: MenuDef[] = [
    { name: "ยำวุ้นเส้น", recipe: "ยำวุ้นเส้น", category: "อาหาร", basePrice: 65 },
    { name: "ยำมาม่า", recipe: "ยำมาม่า", category: "อาหาร", basePrice: 55 },
    { name: "ไข่เจียว", recipe: "ไข่เจียว", category: "อาหาร", basePrice: 40 },
    { name: "ไข่ดาว", recipe: "ไข่ดาว", category: "อาหาร", basePrice: 15 },
  ];
  const existingFoodMenuNames = new Set(menus.map((m) => m.name));
  for (const def of foodMenuDefs) {
    if (existingFoodMenuNames.has(def.name)) continue;
    const category = categories.find((c) => c.name === def.category) ?? categories[0];
    const menu = await prisma.menu.create({
      data: {
        branchId,
        categoryId: category.id,
        recipeId: recipeByName(def.recipe).id,
        name: def.name,
        basePrice: def.basePrice,
        isAvailable: true,
        createdBy: owner.id,
      },
      include: { variants: true },
    });
    menus.push(menu);
  }

  // ------------------------------------------------------------------
  // Modifier groups (target 8) + modifiers, linked to relevant menus
  // ------------------------------------------------------------------
  type ModDef = { name: string; ingredient?: string; qty?: number; priceDelta: number };
  type GroupDef = {
    name: string;
    selectionType: ModifierSelectionType;
    isRequired: boolean;
    modifiers: ModDef[];
    appliesTo: string[];
  };
  const groupDefs: GroupDef[] = [
    {
      name: "ท็อปปิ้ง",
      selectionType: "multiple",
      isRequired: false,
      modifiers: [
        { name: "ไข่มุก", ingredient: "ไข่มุก (ไทเปียก้า)", qty: 30, priceDelta: 10 },
        { name: "วุ้นมะพร้าว", priceDelta: 10 },
        { name: "ปุยฝ้าย", priceDelta: 15 },
      ],
      appliesTo: ["ชาไทยเย็น", "ชานมไข่มุก", "โกโก้เย็น", "มัทฉะลาเต้เย็น"],
    },
    {
      name: "ระดับความหวาน",
      selectionType: "single",
      isRequired: true,
      modifiers: [
        { name: "หวาน 100%", priceDelta: 0 },
        { name: "หวาน 75%", priceDelta: 0 },
        { name: "หวาน 50%", priceDelta: 0 },
        { name: "หวาน 25%", priceDelta: 0 },
        { name: "ไม่หวาน", priceDelta: 0 },
      ],
      appliesTo: menuDefs.map((m) => m.name),
    },
    {
      name: "ระดับน้ำแข็ง",
      selectionType: "single",
      isRequired: false,
      modifiers: [
        { name: "น้ำแข็งปกติ", priceDelta: 0 },
        { name: "น้ำแข็งน้อย", priceDelta: 0 },
        { name: "ไม่ใส่น้ำแข็ง", priceDelta: 0 },
      ],
      appliesTo: menuDefs.filter((m) => m.category !== "ปั่น").map((m) => m.name),
    },
    {
      name: "ชนิดนม",
      selectionType: "single",
      isRequired: false,
      modifiers: [
        { name: "นมสด", priceDelta: 0 },
        { name: "นมข้นหวานเพิ่ม", ingredient: "นมข้นหวาน", qty: 15, priceDelta: 5 },
        { name: "นมโอ๊ต (No dairy)", priceDelta: 10 },
      ],
      appliesTo: ["กาแฟเย็น", "ลาเต้เย็น", "โกโก้เย็น", "กาแฟปั่น"],
    },
    {
      name: "เพิ่มช็อตกาแฟ",
      selectionType: "multiple",
      isRequired: false,
      modifiers: [
        { name: "เพิ่ม 1 ช็อต", ingredient: "กาแฟคั่วบด", qty: 9, priceDelta: 10 },
        { name: "เพิ่ม 2 ช็อต", ingredient: "กาแฟคั่วบด", qty: 18, priceDelta: 18 },
      ],
      appliesTo: ["กาแฟเย็น", "ลาเต้เย็น", "กาแฟปั่น"],
    },
    {
      name: "ไซรัปเสริมรส",
      selectionType: "multiple",
      isRequired: false,
      modifiers: [
        { name: "ไซรัปคาราเมล", priceDelta: 10 },
        { name: "ไซรัปวานิลลา", priceDelta: 10 },
        { name: "ไซรัปเฮเซลนัท", priceDelta: 10 },
      ],
      appliesTo: ["ลาเต้เย็น", "กาแฟเย็น", "กาแฟปั่น", "มัทฉะปั่น"],
    },
    {
      name: "ครีมท็อป",
      selectionType: "single",
      isRequired: false,
      modifiers: [
        { name: "วิปครีม", priceDelta: 15 },
        { name: "ชีสครีม", priceDelta: 20 },
      ],
      appliesTo: ["มัทฉะปั่น", "กาแฟปั่น", "โกโก้เย็น"],
    },
    {
      name: "ขนาดแก้วพิเศษ",
      selectionType: "single",
      isRequired: false,
      modifiers: [{ name: "แก้ว XL +10oz", priceDelta: 15 }],
      appliesTo: ["ชาไทยเย็น", "ชานมไข่มุก"],
    },
  ];

  const groups = await prisma.modifierGroup.findMany({ include: { modifiers: true } });
  const existingGroupNames = new Set(groups.map((g) => g.name));
  for (const def of groupDefs) {
    if (existingGroupNames.has(def.name)) continue;
    if (groups.length >= 8) break;
    const group = await prisma.modifierGroup.create({
      data: {
        branchId,
        name: def.name,
        selectionType: def.selectionType,
        isRequired: def.isRequired,
        modifiers: {
          create: def.modifiers.map((m) => ({
            name: m.name,
            ingredientId: m.ingredient ? byName(m.ingredient).id : null,
            ingredientQuantity: m.qty ?? null,
            priceDelta: m.priceDelta,
          })),
        },
      },
      include: { modifiers: true },
    });
    groups.push(group);

    for (const menuName of def.appliesTo) {
      const menu = menus.find((m) => m.name === menuName);
      if (!menu) continue;
      await prisma.menuModifierGroup.upsert({
        where: { menuId_modifierGroupId: { menuId: menu.id, modifierGroupId: group.id } },
        create: { menuId: menu.id, modifierGroupId: group.id },
        update: {},
      });
    }
  }

  // ------------------------------------------------------------------
  // Food modifier group — kept separate from groupDefs' `groups.length >= 8`
  // cap (a named-lookup style exception, same reasoning as ingredients/
  // recipes/categories above) and only attached to the two ยำ menus, not
  // the drink-wide "appliesTo: menuDefs.map(...)" groups.
  // ------------------------------------------------------------------
  const spiceGroupDef: GroupDef = {
    name: "ระดับความเผ็ด",
    selectionType: "single",
    isRequired: true,
    modifiers: [
      { name: "ไม่เผ็ด", priceDelta: 0 },
      { name: "เผ็ดน้อย", priceDelta: 0 },
      { name: "เผ็ดปกติ", priceDelta: 0 },
      { name: "เผ็ดมาก", priceDelta: 0 },
    ],
    appliesTo: ["ยำวุ้นเส้น", "ยำมาม่า"],
  };
  let spiceGroup = groups.find((g) => g.name === spiceGroupDef.name) ?? null;
  if (!spiceGroup) {
    spiceGroup = await prisma.modifierGroup.create({
      data: {
        branchId,
        name: spiceGroupDef.name,
        selectionType: spiceGroupDef.selectionType,
        isRequired: spiceGroupDef.isRequired,
        modifiers: {
          create: spiceGroupDef.modifiers.map((m) => ({ name: m.name, priceDelta: m.priceDelta })),
        },
      },
      include: { modifiers: true },
    });
  }
  for (const menuName of spiceGroupDef.appliesTo) {
    const menu = menus.find((m) => m.name === menuName);
    if (!menu) continue;
    await prisma.menuModifierGroup.upsert({
      where: { menuId_modifierGroupId: { menuId: menu.id, modifierGroupId: spiceGroup.id } },
      create: { menuId: menu.id, modifierGroupId: spiceGroup.id },
      update: {},
    });
  }

  // ------------------------------------------------------------------
  // Purchase orders (target 10: 6 received w/ stock-in movements, 4 pending)
  // ------------------------------------------------------------------
  const existingPOCount = await prisma.purchaseOrder.count();
  const poTarget = 10;
  for (let i = existingPOCount; i < poTarget; i++) {
    const status: PurchaseOrderStatus = i < 6 ? "received" : "pending";
    const supplier = suppliers[i % suppliers.length];
    const pickedIngredients = [...ingredients]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2 + (i % 2));
    const orderedAt = daysAgo(20 - i * 2);

    const po = await prisma.purchaseOrder.create({
      data: {
        branchId,
        supplierId: supplier.id,
        status,
        orderedAt,
        receivedAt: status === "received" ? daysAgo(19 - i * 2) : null,
        createdBy: manager.id,
        items: {
          create: pickedIngredients.map((ing) => {
            const conv = ing.unitConversions[0];
            const qty = 5 + Math.floor(Math.random() * 10);
            const unitPrice = conv
              ? Number(ing.costPerUnit) * Number(conv.conversionFactor)
              : Number(ing.costPerUnit);
            return {
              ingredientId: ing.id,
              purchaseUnitName: conv?.purchaseUnitName ?? "หน่วย",
              quantity: qty,
              unitPrice,
            };
          }),
        },
      },
      include: { items: { include: { ingredient: { include: { unitConversions: true } } } } },
    });

    if (status === "received") {
      for (const item of po.items) {
        const conv = item.ingredient.unitConversions[0];
        const baseQty = conv
          ? Number(item.quantity) * Number(conv.conversionFactor)
          : Number(item.quantity);
        await prisma.inventoryMovement.create({
          data: {
            branchId,
            ingredientId: item.ingredientId,
            movementType: "stock_in",
            quantity: baseQty,
            referenceType: "purchase_order_item",
            referenceId: item.id,
            createdBy: manager.id,
            createdAt: po.receivedAt!,
          },
        });
        await prisma.ingredient.update({
          where: { id: item.ingredientId },
          data: { currentStockQty: { increment: baseQty } },
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // A few manual stock-out / adjustment movements (reason codes already seeded)
  // ------------------------------------------------------------------
  const reasonCodes = await prisma.reasonCode.findMany();
  const existingMovementCount = await prisma.inventoryMovement.count();
  const movementTarget = 12;
  for (let i = existingMovementCount; i < movementTarget; i++) {
    const ing = rand(ingredients);
    const isAdjustment = i % 5 === 0;
    const qty = 1 + Math.floor(Math.random() * 5);
    await prisma.inventoryMovement.create({
      data: {
        branchId,
        ingredientId: ing.id,
        movementType: isAdjustment ? "adjustment" : "stock_out",
        quantity: -qty,
        reasonCode: isAdjustment ? undefined : (reasonCodes[0]?.code ?? "other"),
        createdBy: isAdjustment ? owner.id : employee.id,
        createdAt: daysAgo(Math.floor(Math.random() * 14)),
      },
    });
    await prisma.ingredient.update({
      where: { id: ing.id },
      data: { currentStockQty: { decrement: qty } },
    });
  }

  // ------------------------------------------------------------------
  // Sales transactions (target 10) incl. 1 void + 2 refund requests
  // ------------------------------------------------------------------
  const paymentMethods: PaymentMethod[] = ["cash", "qr"];
  const vatMode: VatMode = taxSettings.vatMode;
  const vatRate = taxSettings.vatRate;
  const existingSaleCount = await prisma.salesTransaction.count();
  const saleTarget = 10;
  const createdSales: { id: string; total: number }[] = [];

  for (let i = existingSaleCount; i < saleTarget; i++) {
    const itemCount = 1 + Math.floor(Math.random() * 2);
    const chosenMenus = [...menus].sort(() => Math.random() - 0.5).slice(0, itemCount);

    let subtotal = 0;
    const itemsData: {
      menuId: string;
      menuVariantId: string;
      quantity: number;
      unitPrice: number;
      costAtSaleTime: number;
      modifiers: {
        modifierId: string;
        modifierNameSnapshot: string;
        priceDeltaSnapshot: number;
        ingredientCostSnapshot: number | null;
      }[];
    }[] = [];

    for (const menu of chosenMenus) {
      const variant = menu.variants.find((v) => v.isDefault) ?? menu.variants[0];
      if (!variant) continue;
      const menuGroups = await prisma.menuModifierGroup.findMany({
        where: { menuId: menu.id },
        include: { modifierGroup: { include: { modifiers: true } } },
      });
      const pickedModifiers = menuGroups
        .filter(() => Math.random() > 0.5)
        .map((mg) => rand(mg.modifierGroup.modifiers))
        .filter(Boolean);

      const variantCost = await calculateVariantCost(variant.id);
      let modifierCostTotal = 0;
      const modifierData = [];
      for (const mod of pickedModifiers) {
        const modCost = await calculateModifierCost(mod.id);
        modifierCostTotal += modCost;
        modifierData.push({
          modifierId: mod.id,
          modifierNameSnapshot: mod.name,
          priceDeltaSnapshot: Number(mod.priceDelta),
          ingredientCostSnapshot: mod.ingredientId ? modCost : null,
        });
      }

      const quantity = 1 + (Math.random() > 0.7 ? 1 : 0);
      const unitPrice =
        Number(menu.basePrice) +
        Number(variant.priceDelta) +
        modifierData.reduce((s, m) => s + m.priceDeltaSnapshot, 0);
      subtotal += unitPrice * quantity;

      itemsData.push({
        menuId: menu.id,
        menuVariantId: variant.id,
        quantity,
        unitPrice,
        costAtSaleTime: variantCost + modifierCostTotal,
        modifiers: modifierData,
      });
    }

    if (itemsData.length === 0) continue;

    const discountAmount = i % 4 === 0 ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
    const rawTotal = subtotal - discountAmount;
    const totalAmount = Math.round(rawTotal);
    const roundingAdjustment = Math.round((totalAmount - rawTotal) * 100) / 100;

    const cashierUser = rand([cashier, shiftSupervisor]);
    const sale = await prisma.salesTransaction.create({
      data: {
        branchId,
        cashierId: cashierUser.id,
        paymentMethod: rand(paymentMethods),
        subtotal,
        discountAmount,
        roundingAdjustment,
        totalAmount,
        vatModeSnapshot: vatMode,
        vatRateSnapshot: vatRate,
        createdBy: cashierUser.id,
        createdAt: daysAgo(13 - i),
        items: {
          create: itemsData.map((it) => ({
            menuId: it.menuId,
            menuVariantId: it.menuVariantId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            costAtSaleTime: it.costAtSaleTime,
            modifiers: { create: it.modifiers },
          })),
        },
      },
    });
    createdSales.push({ id: sale.id, total: Number(sale.totalAmount) });

    // deduct stock for each recipe ingredient (same-day sale)
    for (const it of itemsData) {
      const menu = menus.find((m) => m.id === it.menuId)!;
      const recipe = recipes.find((r) => r.id === menu.recipeId);
      if (!recipe) continue;
      const variant = menu.variants.find((v) => v.id === it.menuVariantId);
      const multiplier = variant?.recipeMultiplier ? Number(variant.recipeMultiplier) : 1;
      for (const ri of recipe.ingredients) {
        const qty = Number(ri.quantity) * multiplier * it.quantity;
        await prisma.inventoryMovement.create({
          data: {
            branchId,
            ingredientId: ri.ingredientId,
            movementType: "stock_out",
            quantity: -qty,
            referenceType: "sales_transaction_item",
            referenceId: sale.id,
            createdBy: cashierUser.id,
            createdAt: sale.createdAt,
          },
        });
        await prisma.ingredient.update({
          where: { id: ri.ingredientId },
          data: { currentStockQty: { decrement: qty } },
        });
      }
    }
  }

  // Void the most recent sale (same-day) if we made any and none are voided yet
  const alreadyVoided = await prisma.salesTransaction.count({
    where: { voidReason: { not: null } },
  });
  if (createdSales.length > 0 && alreadyVoided === 0) {
    const target = createdSales[createdSales.length - 1];
    await prisma.salesTransaction.create({
      data: {
        branchId,
        cashierId: cashier.id,
        paymentMethod: "cash",
        subtotal: 0,
        discountAmount: 0,
        roundingAdjustment: 0,
        totalAmount: -target.total,
        vatModeSnapshot: vatMode,
        vatRateSnapshot: vatRate,
        reversalOfId: target.id,
        voidReason: "ลูกค้าเปลี่ยนใจ (mock data)",
        createdBy: cashier.id,
      },
    });
  }

  // Refund requests: 1 approved by Shift Supervisor (below threshold), 1 pending for Manager (above threshold)
  const existingRefundCount = await prisma.refundRequest.count();
  if (existingRefundCount === 0 && createdSales.length >= 2) {
    const threshold = Number(taxSettings.refundApprovalThreshold);
    const belowTarget = createdSales.find((s) => s.total <= threshold) ?? createdSales[0];
    const aboveTarget = createdSales.find((s) => s.total > threshold) ?? createdSales[1];

    await prisma.refundRequest.create({
      data: {
        salesTransactionId: belowTarget.id,
        requestedBy: cashier.id,
        reason: "ลูกค้าได้รับสินค้าผิดรายการ (mock data)",
        status: "approved",
        decidedBy: shiftSupervisor.id,
        decidedAt: new Date(),
      },
    });
    await prisma.refundRequest.create({
      data: {
        salesTransactionId: aboveTarget.id,
        requestedBy: shiftSupervisor.id,
        reason: "ลูกค้าขอคืนเงินทั้งบิล (mock data)",
        status: "pending",
      },
    });
  }

  // ------------------------------------------------------------------
  // Expense entries (target 10 total)
  // ------------------------------------------------------------------
  const expenseCategories = await prisma.expenseCategory.findMany();
  const existingExpenseCount = await prisma.expenseEntry.count();
  const expenseTarget = 10;
  const expenseDescs = [
    "ค่าเช่าร้านประจำเดือน",
    "ค่าไฟฟ้าประจำเดือน",
    "ค่าน้ำประปาประจำเดือน",
    "เงินเดือนพนักงานกะเช้า",
    "เงินเดือนพนักงานกะบ่าย",
    "ค่าอินเทอร์เน็ต",
    "ค่าซ่อมเครื่องปั่นน้ำแข็ง",
    "ค่าวัสดุสิ้นเปลือง (กระดาษเช็ดปาก, ทิชชู่)",
    "ค่าแก๊สหุงต้ม",
    "ค่าทำความสะอาดร้าน",
  ];
  for (let i = existingExpenseCount; i < expenseTarget; i++) {
    await prisma.expenseEntry.create({
      data: {
        branchId,
        categoryId: rand(expenseCategories).id,
        amount: 300 + Math.floor(Math.random() * 4000),
        description: expenseDescs[i % expenseDescs.length],
        createdBy: rand([accountant, owner]).id,
        createdAt: daysAgo(Math.floor(Math.random() * 25)),
      },
    });
  }

  // ------------------------------------------------------------------
  // A handful of extra (non-loginable) mock users, clearly labeled, to
  // exercise the Users list/edit-role/deactivate CRUD beyond the 6 real
  // accounts already used for RBAC login testing.
  // ------------------------------------------------------------------
  const mockUserDefs = [
    { fullName: "ทดสอบ แคชเชียร์สอง", role: "cashier" as const },
    { fullName: "ทดสอบ พนักงานสอง", role: "employee" as const },
    { fullName: "ทดสอบ ผู้จัดการกะ", role: "shift_supervisor" as const },
    { fullName: "ทดสอบ ผู้ช่วยผู้จัดการ", role: "manager" as const },
  ];
  const existingUserCount = await prisma.user.count();
  for (let i = 0; i < mockUserDefs.length && existingUserCount + i < 10; i++) {
    const def = mockUserDefs[i];
    const email = `mock.${def.role}${i + 1}@dsms.local`;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) continue;
    await prisma.user.create({
      data: { organizationId, email, fullName: def.fullName, role: def.role, isActive: true },
    });
  }

  // A few extra pending/expired invites for onboarding-flow testing
  const inviteRoles = ["cashier", "employee", "shift_supervisor"] as const;
  const existingInviteCount = await prisma.userInvite.count();
  for (let i = 0; i < inviteRoles.length && existingInviteCount + i < 8; i++) {
    const email = `invite.mock${i + 1}@dsms.local`;
    const exists = await prisma.userInvite.findFirst({ where: { email } });
    if (exists) continue;
    await prisma.userInvite.create({
      data: {
        organizationId,
        email,
        role: inviteRoles[i],
        invitedById: owner.id,
        token: `mock-token-${Date.now()}-${i}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
  }

  console.log("Mock data seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
