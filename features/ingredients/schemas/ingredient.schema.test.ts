import { describe, it, expect } from "vitest";
import { ingredientSchema, unitConversionSchema } from "./ingredient.schema";

describe("ingredientSchema", () => {
  it("accepts a valid ingredient", () => {
    const result = ingredientSchema.safeParse({
      name: "ผงชาไทย",
      baseUnit: "gram",
      costPerUnit: 0.475,
      lowStockThreshold: 500,
      supplierId: "",
    });
    expect(result.success).toBe(true);
  });

  // DECISIONS.md D2: base_unit is exactly gram/ml/piece, nothing else
  it("rejects a base unit outside gram/ml/piece", () => {
    const result = ingredientSchema.safeParse({
      name: "ผงชาไทย",
      baseUnit: "kg",
      costPerUnit: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative cost_per_unit", () => {
    const result = ingredientSchema.safeParse({
      name: "ผงชาไทย",
      baseUnit: "gram",
      costPerUnit: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = ingredientSchema.safeParse({
      name: "",
      baseUnit: "gram",
      costPerUnit: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("unitConversionSchema", () => {
  it("accepts a valid conversion", () => {
    const result = unitConversionSchema.safeParse({
      purchaseUnitName: "ถุง 200g",
      conversionFactor: 200,
    });
    expect(result.success).toBe(true);
  });

  // DECISIONS.md D2: conversion factor must be a real positive ratio
  it("rejects a zero or negative conversion factor", () => {
    expect(
      unitConversionSchema.safeParse({ purchaseUnitName: "ถุง", conversionFactor: 0 }).success,
    ).toBe(false);
    expect(
      unitConversionSchema.safeParse({ purchaseUnitName: "ถุง", conversionFactor: -5 }).success,
    ).toBe(false);
  });
});
