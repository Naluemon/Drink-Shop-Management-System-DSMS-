import { describe, it, expect } from "vitest";
import { validateRecipeImportRows } from "./validate-import";
import { RECIPE_IMPORT_COLUMNS } from "../schemas/recipe-import.schema";

const C = RECIPE_IMPORT_COLUMNS;

function ingredientsMap(entries: [string, string][]) {
  return new Map(entries.map(([name, id]) => [name, { id, baseUnit: "gram" }] as const));
}

function row(recipeName: string, yieldValue: number, ingredientName: string, quantity: number) {
  return {
    [C.recipeName]: recipeName,
    [C.yield]: yieldValue,
    [C.ingredientName]: ingredientName,
    [C.quantity]: quantity,
  };
}

describe("validateRecipeImportRows", () => {
  it("groups multiple rows sharing a recipe name into one recipe", () => {
    const result = validateRecipeImportRows(
      [row("ชาไทย", 10, "ใบชา", 50), row("ชาไทย", 10, "น้ำตาล", 20)],
      new Set(),
      ingredientsMap([
        ["ใบชา", "ing-1"],
        ["น้ำตาล", "ing-2"],
      ]),
    );
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0]).toMatchObject({ name: "ชาไทย", yield: 10 });
    expect(result.toCreate[0].ingredients).toHaveLength(2);
  });

  it("groups recipe names case-insensitively", () => {
    const result = validateRecipeImportRows(
      [row("Latte", 1, "กาแฟ", 18), row("latte", 1, "นม", 150)],
      new Set(),
      ingredientsMap([
        ["กาแฟ", "ing-1"],
        ["นม", "ing-2"],
      ]),
    );
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].ingredients).toHaveLength(2);
  });

  it("rejects a row referencing an ingredient that doesn't exist, failing the whole recipe", () => {
    const result = validateRecipeImportRows(
      [row("ชาไทย", 10, "ใบชา", 50), row("ชาไทย", 10, "ไม่มีจริง", 20)],
      new Set(),
      ingredientsMap([["ใบชา", "ing-1"]]),
    );
    expect(result.toCreate).toHaveLength(0);
    expect(result.errors).toEqual([
      { recipeName: "ชาไทย", rowNumber: 3, reason: "ไม่พบวัตถุดิบ: ไม่มีจริง" },
    ]);
  });

  it("rejects a non-positive quantity", () => {
    const result = validateRecipeImportRows(
      [row("ชาไทย", 10, "ใบชา", -5)],
      new Set(),
      ingredientsMap([["ใบชา", "ing-1"]]),
    );
    expect(result.errors).toHaveLength(1);
  });

  it("rejects a non-positive yield", () => {
    const result = validateRecipeImportRows(
      [row("ชาไทย", 0, "ใบชา", 50)],
      new Set(),
      ingredientsMap([["ใบชา", "ing-1"]]),
    );
    expect(result.errors).toHaveLength(1);
  });

  it("skips a recipe name that already exists in the DB (case-insensitive)", () => {
    const result = validateRecipeImportRows(
      [row("ชาไทย", 10, "ใบชา", 50)],
      new Set(["ชาไทย"]),
      ingredientsMap([["ใบชา", "ing-1"]]),
    );
    expect(result.toCreate).toHaveLength(0);
    expect(result.duplicates).toEqual([{ name: "ชาไทย" }]);
  });

  it("treats a blank recipe name on its own row as its own isolated error, not merged with other blank rows", () => {
    const result = validateRecipeImportRows(
      [row("", 10, "ใบชา", 50), row("", 10, "น้ำตาล", 20)],
      new Set(),
      ingredientsMap([
        ["ใบชา", "ing-1"],
        ["น้ำตาล", "ing-2"],
      ]),
    );
    expect(result.toCreate).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toBe("กรุณากรอกชื่อสูตร");
  });
});
