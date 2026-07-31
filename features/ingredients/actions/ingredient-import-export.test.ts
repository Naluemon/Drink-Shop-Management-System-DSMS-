import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

// vi.hoisted is required here (not a plain top-level const) because vi.mock
// factories are hoisted above all other module-level statements, and this
// factory references `recordStockIn` eagerly in the returned object literal —
// a plain `const recordStockIn = vi.fn(...)` below the vi.mock call would hit
// a TDZ error ("Cannot access before initialization") when the mocked module
// is first imported.
const { recordStockIn } = vi.hoisted(() => ({
  recordStockIn: vi.fn(async () => ({ success: true, movementId: "mv-1" })),
}));
vi.mock("@/features/inventory/actions/inventory", () => ({ recordStockIn }));

import { prisma } from "@/lib/prisma";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";
import {
  previewIngredientImport,
  commitIngredientImport,
  exportIngredients,
} from "./ingredient-import-export";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;
const C = INGREDIENT_IMPORT_COLUMNS;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "A",
    role,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  recordStockIn.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

function fileWithRows(rows: Record<string, unknown>[]): string {
  const columns = Object.values(C).map((label) => ({ key: label as never, label }));
  const buffer = buildSpreadsheet(rows, columns, "xlsx");
  return buffer.toString("base64");
}

describe("previewIngredientImport", () => {
  it("denies a role without ingredient-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await previewIngredientImport(fileWithRows([]));

    expect("error" in result).toBe(true);
  });

  it("parses the file and returns creatable/duplicate/error buckets", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findMany.mockResolvedValue([{ name: "เกลือ" }] as never);

    const fileBase64 = fileWithRows([
      { [C.name]: "น้ำตาล", [C.baseUnit]: "กรัม", [C.costPerUnit]: 10 },
      { [C.name]: "เกลือ", [C.baseUnit]: "กรัม", [C.costPerUnit]: 5 },
    ]);

    const result = await previewIngredientImport(fileBase64);

    if ("error" in result) throw new Error("expected buckets, got error");
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].name).toBe("น้ำตาล");
    expect(result.duplicates).toEqual([{ rowNumber: 3, name: "เกลือ" }]);
  });

  it("rejects a file over the row cap without touching the DB", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    const rows = Array.from({ length: 501 }, (_, i) => ({
      [C.name]: `วัตถุดิบ${i}`,
      [C.baseUnit]: "กรัม",
      [C.costPerUnit]: 1,
    }));

    const result = await previewIngredientImport(fileWithRows(rows));

    expect("error" in result).toBe(true);
    expect(prismaMock.ingredient.findMany).not.toHaveBeenCalled();
  });
});

describe("commitIngredientImport", () => {
  it("denies a role without ingredient-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await commitIngredientImport([]);

    expect("error" in result).toBe(true);
  });

  it("creates an ingredient, its unit conversion, and calls recordStockIn when starting stock > 0", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue({ id: "sup-1" } as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-1" } as never);
    prismaMock.unitConversion.create.mockResolvedValue({} as never);

    const result = await commitIngredientImport([
      {
        rowNumber: 2,
        name: "น้ำตาล",
        baseUnit: "gram",
        costPerUnit: 10,
        startingStock: 100,
        lowStockThreshold: null,
        supplierName: "ร้านค้าส่ง ก.",
        purchaseUnitName: "กระสอบ",
        conversionFactor: 1000,
      },
    ]);

    expect("success" in result).toBe(true);
    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.ingredient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supplierId: "sup-1" }) }),
    );
    expect(prismaMock.unitConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientId: "ing-1",
          purchaseUnitName: "กระสอบ",
          conversionFactor: 1000,
        }),
      }),
    );
    expect(recordStockIn).toHaveBeenCalledWith(
      expect.objectContaining({ ingredientId: "ing-1", quantity: 100 }),
    );
  });

  it("reuses one supplier across two rows naming the same supplier", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue({ id: "sup-1" } as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-x" } as never);

    await commitIngredientImport([
      {
        rowNumber: 2,
        name: "A",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: "ผู้จำหน่ายเดียวกัน",
        purchaseUnitName: null,
        conversionFactor: null,
      },
      {
        rowNumber: 3,
        name: "B",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: "ผู้จำหน่ายเดียวกัน",
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
  });

  it("skips a row whose name was created by a concurrent import since preview", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue({ id: "already-exists" } as never);

    const result = await commitIngredientImport([
      {
        rowNumber: 2,
        name: "ซ้ำ",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: null,
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(0);
    expect(prismaMock.ingredient.create).not.toHaveBeenCalled();
  });

  it("does not call recordStockIn when starting stock is 0", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-2" } as never);

    await commitIngredientImport([
      {
        rowNumber: 2,
        name: "ไม่มีสต็อกเริ่มต้น",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: null,
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    expect(recordStockIn).not.toHaveBeenCalled();
  });
});

describe("exportIngredients", () => {
  it("denies a role without ingredient-view permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await exportIngredients("csv");

    expect("error" in result).toBe(true);
  });

  it("returns a base64 file for the current ingredient list", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findMany.mockResolvedValue([
      {
        name: "น้ำตาล",
        baseUnit: "gram",
        costPerUnit: { toString: () => "10" },
        currentStockQty: { toString: () => "50" },
        lowStockThreshold: null,
        supplier: null,
        unitConversions: [],
      },
    ] as never);

    const result = await exportIngredients("csv");

    if ("error" in result) throw new Error("expected success");
    expect(result.filename).toBe("ingredients-export.csv");
    expect(result.fileBase64.length).toBeGreaterThan(0);
  });
});
