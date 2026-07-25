import { describe, it, expect } from "vitest";
import { computeVatAmount, computeTotalWithVat, roundToWholeBaht } from "./money-formulas";

describe("computeVatAmount", () => {
  it("extracts VAT from an inclusive amount (default mode, D9)", () => {
    // 107 baht at 7% inclusive means 7 baht of that is VAT (100 net + 7 VAT)
    expect(computeVatAmount(107, 7, "inclusive")).toBeCloseTo(7, 4);
  });

  it("adds VAT on top for exclusive mode", () => {
    expect(computeVatAmount(100, 7, "exclusive")).toBeCloseTo(7, 4);
  });

  it("is zero when vat_mode is none", () => {
    expect(computeVatAmount(100, 7, "none")).toBe(0);
  });
});

describe("computeTotalWithVat", () => {
  it("adds VAT on top only for exclusive mode", () => {
    expect(computeTotalWithVat(100, 7, "exclusive")).toBeCloseTo(107, 4);
  });

  it("leaves the subtotal unchanged for inclusive and none", () => {
    expect(computeTotalWithVat(107, 7, "inclusive")).toBe(107);
    expect(computeTotalWithVat(100, 7, "none")).toBe(100);
  });
});

// TESTING.md TC-RND-01: ขาย 2 แก้ว Size M ราคารวม 70.00 บาท, ส่วนลดบิล 5%
// (3.50 บาท) -> ยอดก่อนปัดเศษ 66.50 -> ปัดขึ้นเป็น 67.00, rounding_adjustment +0.50
describe("roundToWholeBaht", () => {
  it("matches the reference dataset (66.50 -> 67.00, +0.50 adjustment)", () => {
    const { rounded, adjustment } = roundToWholeBaht(70.0 - 3.5);
    expect(rounded).toBe(67);
    expect(adjustment).toBeCloseTo(0.5, 2);
  });

  it("rounds down below the 0.50 boundary", () => {
    const { rounded, adjustment } = roundToWholeBaht(66.49);
    expect(rounded).toBe(66);
    expect(adjustment).toBeCloseTo(-0.49, 2);
  });

  it("rounds up exactly at the 0.50 boundary (round-half-up)", () => {
    const { rounded } = roundToWholeBaht(66.5);
    expect(rounded).toBe(67);
  });

  it("leaves a whole-baht amount unchanged", () => {
    const { rounded, adjustment } = roundToWholeBaht(50);
    expect(rounded).toBe(50);
    expect(adjustment).toBe(0);
  });
});
