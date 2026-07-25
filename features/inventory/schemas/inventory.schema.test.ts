import { describe, it, expect } from "vitest";
import { stockInSchema, stockOutSchema, adjustmentSchema } from "./inventory.schema";

describe("stockInSchema", () => {
  it("accepts a valid stock-in", () => {
    expect(stockInSchema.safeParse({ ingredientId: "i1", quantity: 10 }).success).toBe(true);
  });

  it("rejects a non-positive quantity", () => {
    expect(stockInSchema.safeParse({ ingredientId: "i1", quantity: 0 }).success).toBe(false);
    expect(stockInSchema.safeParse({ ingredientId: "i1", quantity: -5 }).success).toBe(false);
  });
});

describe("stockOutSchema", () => {
  // FR-INV-02 / DECISIONS.md D12: reason_code is mandatory. Phase 12 /
  // FR-SET-05 moved the "must be a real, active reason code" check to
  // recordStockOut (DB-backed ReasonCode table) — this schema only guards
  // against an empty submission.
  it("requires a non-empty reason code", () => {
    expect(
      stockOutSchema.safeParse({ ingredientId: "i1", quantity: 5, reasonCode: "spoiled" }).success,
    ).toBe(true);
    expect(stockOutSchema.safeParse({ ingredientId: "i1", quantity: 5 }).success).toBe(false);
    expect(
      stockOutSchema.safeParse({ ingredientId: "i1", quantity: 5, reasonCode: "" }).success,
    ).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    expect(
      stockOutSchema.safeParse({ ingredientId: "i1", quantity: 0, reasonCode: "spoiled" }).success,
    ).toBe(false);
  });
});

describe("adjustmentSchema", () => {
  it("accepts a positive or negative non-zero delta", () => {
    expect(adjustmentSchema.safeParse({ ingredientId: "i1", delta: 5 }).success).toBe(true);
    expect(adjustmentSchema.safeParse({ ingredientId: "i1", delta: -5 }).success).toBe(true);
  });

  it("rejects a zero delta", () => {
    expect(adjustmentSchema.safeParse({ ingredientId: "i1", delta: 0 }).success).toBe(false);
  });
});
