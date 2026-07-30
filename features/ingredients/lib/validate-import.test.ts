import { describe, it, expect } from "vitest";
import { validateImportRows } from "./validate-import";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";

const C = INGREDIENT_IMPORT_COLUMNS;

function row(overrides: Record<string, unknown>) {
  return {
    [C.name]: "น้ำตาลทราย",
    [C.baseUnit]: "กรัม",
    [C.costPerUnit]: 25,
    ...overrides,
  };
}

describe("validateImportRows", () => {
  it("accepts a fully valid row with no optional fields", () => {
    const result = validateImportRows([row({})], new Set());
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicates).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.toCreate[0]).toMatchObject({
      rowNumber: 2,
      name: "น้ำตาลทราย",
      baseUnit: "gram",
      costPerUnit: 25,
      startingStock: 0,
      lowStockThreshold: null,
      supplierName: null,
      purchaseUnitName: null,
      conversionFactor: null,
    });
  });

  it("carries through starting stock, supplier, and unit conversion when present", () => {
    const result = validateImportRows(
      [
        row({
          [C.startingStock]: 100,
          [C.supplierName]: "ร้านค้าส่ง ก.",
          [C.purchaseUnitName]: "กระสอบ",
          [C.conversionFactor]: 1000,
        }),
      ],
      new Set(),
    );
    expect(result.toCreate[0]).toMatchObject({
      startingStock: 100,
      supplierName: "ร้านค้าส่ง ก.",
      purchaseUnitName: "กระสอบ",
      conversionFactor: 1000,
    });
  });

  it("rejects a missing name", () => {
    const result = validateImportRows([row({ [C.name]: "" })], new Set());
    expect(result.toCreate).toHaveLength(0);
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "กรุณากรอกชื่อวัตถุดิบ" }]);
  });

  it("rejects an invalid baseUnit value", () => {
    const result = validateImportRows([row({ [C.baseUnit]: "ลิตร" })], new Set());
    expect(result.errors).toEqual([
      { rowNumber: 2, reason: "หน่วยฐานต้องเป็น กรัม / มล. / ชิ้น เท่านั้น" },
    ]);
  });

  it("rejects a negative cost", () => {
    const result = validateImportRows([row({ [C.costPerUnit]: -1 })], new Set());
    expect(result.errors).toHaveLength(1);
  });

  it("rejects a unit-conversion pair with only one side filled", () => {
    const result = validateImportRows([row({ [C.purchaseUnitName]: "กระสอบ" })], new Set());
    expect(result.errors).toEqual([
      { rowNumber: 2, reason: "ต้องกรอกทั้งชื่อหน่วยซื้อและอัตราแปลงคู่กัน หรือไม่กรอกทั้งคู่" },
    ]);
  });

  it("skips a row whose name already exists in the DB (case-insensitive)", () => {
    const result = validateImportRows([row({})], new Set(["น้ำตาลทราย"]));
    expect(result.toCreate).toHaveLength(0);
    expect(result.duplicates).toEqual([{ rowNumber: 2, name: "น้ำตาลทราย" }]);
  });

  it("skips the second occurrence of a name duplicated within the same file", () => {
    const result = validateImportRows([row({}), row({})], new Set());
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicates).toEqual([{ rowNumber: 3, name: "น้ำตาลทราย" }]);
  });

  it("numbers rows starting at 2 (row 1 is the header)", () => {
    const result = validateImportRows([row({}), row({ [C.name]: "เกลือ" })], new Set());
    expect(result.toCreate.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});
