import { describe, it, expect } from "vitest";
import { validateMenuImportRows } from "./validate-import";
import { MENU_IMPORT_COLUMNS } from "../schemas/menu-import.schema";

const C = MENU_IMPORT_COLUMNS;

function row(overrides: Record<string, unknown>) {
  return {
    [C.name]: "ชาไทยเย็น",
    [C.recipeName]: "ชาไทย",
    [C.basePrice]: 45,
    ...overrides,
  };
}

describe("validateMenuImportRows", () => {
  it("accepts a valid row with no optional fields, defaulting isAvailable to true", () => {
    const result = validateMenuImportRows([row({})], new Set(), new Map([["ชาไทย", "recipe-1"]]));
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0]).toMatchObject({
      rowNumber: 2,
      name: "ชาไทยเย็น",
      recipeId: "recipe-1",
      basePrice: 45,
      categoryName: null,
      isAvailable: true,
    });
  });

  it("normalizes category type from Thai labels and carries the raw category name through unresolved", () => {
    const result = validateMenuImportRows(
      [row({ [C.categoryName]: "เครื่องดื่มเย็น", [C.categoryType]: "เครื่องดื่ม" })],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.toCreate[0]).toMatchObject({
      categoryName: "เครื่องดื่มเย็น",
      categoryType: "drink",
    });
  });

  it("parses 'ไม่ใช่' as unavailable", () => {
    const result = validateMenuImportRows(
      [row({ [C.isAvailable]: "ไม่ใช่" })],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.toCreate[0].isAvailable).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = validateMenuImportRows(
      [row({ [C.name]: "" })],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.toCreate).toHaveLength(0);
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "กรุณากรอกชื่อเมนู" }]);
  });

  it("rejects a negative price", () => {
    const result = validateMenuImportRows(
      [row({ [C.basePrice]: -10 })],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.errors).toHaveLength(1);
  });

  it("rejects an invalid image URL", () => {
    const result = validateMenuImportRows(
      [row({ [C.imageUrl]: "not-a-url" })],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "URL รูปภาพไม่ถูกต้อง" }]);
  });

  it("rejects a recipe name that doesn't exist", () => {
    const result = validateMenuImportRows([row({})], new Set(), new Map());
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "ไม่พบสูตร: ชาไทย" }]);
  });

  it("skips a menu name that already exists in the DB (case-insensitive)", () => {
    const result = validateMenuImportRows(
      [row({})],
      new Set(["ชาไทยเย็น"]),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.toCreate).toHaveLength(0);
    expect(result.duplicates).toEqual([{ rowNumber: 2, name: "ชาไทยเย็น" }]);
  });

  it("skips the second occurrence of a menu name duplicated within the same file", () => {
    const result = validateMenuImportRows(
      [row({}), row({})],
      new Set(),
      new Map([["ชาไทย", "recipe-1"]]),
    );
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicates).toEqual([{ rowNumber: 3, name: "ชาไทยเย็น" }]);
  });
});
