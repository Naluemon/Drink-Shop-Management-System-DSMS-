import { describe, it, expect } from "vitest";
import { parseSlipText } from "./expense-slip-ocr";

describe("parseSlipText", () => {
  it("picks the number on a line with an amount keyword over other numbers", () => {
    const text = "โอนเงินสำเร็จ\nค่าธรรมเนียม 0.00\nจำนวนเงิน 350.00 บาท\nยอดคงเหลือ 12,500.75";
    expect(parseSlipText(text).amount).toBe(350.0);
  });

  it("falls back to the largest decimal number when no keyword line matches", () => {
    const text = "รหัสอ้างอิง 12.34\nยอดที่โอน 1,250.00";
    expect(parseSlipText(text).amount).toBe(1250.0);
  });

  it("handles thousands separators", () => {
    const text = "จำนวนเงิน 12,345.67 บาท";
    expect(parseSlipText(text).amount).toBe(12345.67);
  });

  it("returns null when no decimal amount is found", () => {
    const text = "โอนเงินสำเร็จ ขอบคุณที่ใช้บริการ";
    expect(parseSlipText(text).amount).toBeNull();
  });

  it("is case-insensitive for English keywords", () => {
    const text = "Reference 99.00\nAMOUNT 500.00 THB";
    expect(parseSlipText(text).amount).toBe(500.0);
  });
});
