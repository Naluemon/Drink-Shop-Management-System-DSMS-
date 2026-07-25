import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

interface Row {
  name: string;
  amount: number;
}

describe("toCsv", () => {
  it("serializes header + rows with a UTF-8 BOM prefix", () => {
    const csv = toCsv<Row>(
      [{ name: "ค่าเช่า", amount: 15000 }],
      [
        { key: "name", label: "หมวดหมู่" },
        { key: "amount", label: "จำนวนเงิน" },
      ],
    );

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿หมวดหมู่,จำนวนเงิน\r\nค่าเช่า,15000");
  });

  it("quotes and escapes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv<Row>(
      [{ name: 'มี, คำ "พิเศษ"\nบรรทัดใหม่', amount: 1 }],
      [
        { key: "name", label: "ชื่อ" },
        { key: "amount", label: "จำนวน" },
      ],
    );

    expect(csv).toBe('﻿ชื่อ,จำนวน\r\n"มี, คำ ""พิเศษ""\nบรรทัดใหม่",1');
  });

  it("supports a derived column via a function key", () => {
    const csv = toCsv<Row>(
      [{ name: "A", amount: 2.5 }],
      [{ key: (r) => r.amount.toFixed(2), label: "จำนวน" }],
    );

    expect(csv).toBe("﻿จำนวน\r\n2.50");
  });
});
