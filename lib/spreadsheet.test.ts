import { describe, it, expect } from "vitest";
import { parseSpreadsheet, buildSpreadsheet } from "./spreadsheet";

interface Row {
  name: string;
  amount: string;
}

describe("buildSpreadsheet + parseSpreadsheet round-trip", () => {
  // Note: xlsx's sheet_to_json always applies numeric type-inference to
  // numeric-looking cell text, regardless of source (its own round-tripped
  // output or a plain external CSV) — it cannot preserve "5" as a string
  // while also inferring "1"/"2" as numbers, and nothing downstream needs
  // it to: every numeric import column is parsed with z.coerce.number()
  // (features/ingredients/schemas/ingredient-import.schema.ts, Task 2),
  // which accepts either a string or a number input equally. So these
  // assertions check by value (via String()/Number()), never by exact JS
  // type — asserting an exact type here would just be pinning an
  // implementation detail of the xlsx library that nothing relies on.
  it("round-trips rows through xlsx format", () => {
    const rows: Row[] = [
      { name: "ก", amount: "10" },
      { name: "ข", amount: "20" },
    ];
    const columns = [
      { key: "name" as const, label: "ชื่อ" },
      { key: "amount" as const, label: "จำนวน" },
    ];

    const buffer = buildSpreadsheet(rows, columns, "xlsx");
    const parsed = parseSpreadsheet(buffer);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]["ชื่อ"]).toBe("ก");
    expect(String(parsed[0]["จำนวน"])).toBe("10");
    expect(parsed[1]["ชื่อ"]).toBe("ข");
    expect(String(parsed[1]["จำนวน"])).toBe("20");
  });

  it("round-trips rows through csv format", () => {
    const rows: Row[] = [{ name: "test", amount: "5" }];
    const columns = [
      { key: "name" as const, label: "name" },
      { key: "amount" as const, label: "amount" },
    ];

    const buffer = buildSpreadsheet(rows, columns, "csv");
    const parsed = parseSpreadsheet(buffer);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("test");
    expect(String(parsed[0].amount)).toBe("5");
  });

  it("parses a plain csv buffer not produced by buildSpreadsheet", () => {
    const buffer = Buffer.from("name,amount\nfoo,1\nbar,2\n", "utf8");
    const parsed = parseSpreadsheet(buffer);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("foo");
    expect(Number(parsed[0].amount)).toBe(1);
    expect(parsed[1].name).toBe("bar");
    expect(Number(parsed[1].amount)).toBe(2);
  });

  it("parses a plain csv buffer with non-ASCII (Thai) headers and values", () => {
    // Regression test: a plain external CSV (not produced by buildSpreadsheet)
    // with UTF-8 multi-byte header/value text, and no BOM. Before
    // parseSpreadsheet started prepending a UTF-8 BOM to plain-text buffers
    // that don't already have one, XLSX.read had no signal to detect the
    // encoding from and fell back to a single-byte codepage, producing
    // mojibake keys that didn't match the expected Thai header strings.
    const buffer = Buffer.from("ชื่อวัตถุดิบ,หน่วยฐาน\nทดสอบ,กรัม\n", "utf8");
    const parsed = parseSpreadsheet(buffer);
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0])).toEqual(["ชื่อวัตถุดิบ", "หน่วยฐาน"]);
    expect(parsed[0]["ชื่อวัตถุดิบ"]).toBe("ทดสอบ");
    expect(parsed[0]["หน่วยฐาน"]).toBe("กรัม");
  });

  it("returns an empty array for a header-only file", () => {
    const buffer = Buffer.from("name,amount\n", "utf8");
    expect(parseSpreadsheet(buffer)).toEqual([]);
  });

  it("throws (does not silently return garbage) for a corrupt/unsupported buffer", () => {
    // A leading "PK" zip signature (so parseSpreadsheet's own BOM-prepend
    // logic treats it as an .xlsx, not plain text) followed by bytes that
    // aren't a real zip archive — e.g. a truncated/corrupted .xlsx upload.
    // Callers (previewIngredientImport) are responsible for catching this —
    // this test just pins that parseSpreadsheet itself still throws rather
    // than swallowing the error or returning something misleading.
    const corrupt = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x99,
    ]);
    expect(() => parseSpreadsheet(corrupt)).toThrow();
  });
});
