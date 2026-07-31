import * as XLSX from "xlsx";

export type SpreadsheetFormat = "xlsx" | "csv";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b]); // "PK" — .xlsx files are zip archives

// Reads either an .xlsx or .csv file (XLSX.read auto-detects the format from
// the buffer's content) and returns the first sheet's rows as plain objects
// keyed by the header row's cell values. Single place this parsing logic
// lives, reused by the ingredient import feature and any future bulk import.
export function parseSpreadsheet(buffer: Buffer): Record<string, unknown>[] {
  // Plain-text CSV buffers without a byte-order mark have no signal for
  // XLSX.read to detect their encoding from, so it falls back to a
  // single-byte codepage and mangles multi-byte UTF-8 sequences (e.g. Thai
  // headers) into mojibake. Passing `codepage: 65001` to force UTF-8 isn't
  // safe here — it disables XLSX's own BOM auto-stripping, corrupting
  // buffers that already carry a BOM (e.g. buildSpreadsheet's own CSV
  // output). Instead, prepend a UTF-8 BOM ourselves — but only to
  // plain-text buffers that don't already have one; never to .xlsx buffers,
  // which are zip archives (leading "PK") with their own internal encoding
  // and would be corrupted by a leading BOM.
  const isZip = buffer.subarray(0, 2).equals(ZIP_SIGNATURE);
  const hasBom = buffer.subarray(0, 3).equals(UTF8_BOM);
  const input = isZip || hasBom ? buffer : Buffer.concat([UTF8_BOM, buffer]);
  const workbook = XLSX.read(input, { type: "buffer" });
  // A genuinely empty/sheetless workbook is a legitimate empty-file case,
  // distinct from a truly corrupt buffer (XLSX.read itself throws for that,
  // which callers already handle) — treat it as "no rows" rather than
  // letting sheet_to_json throw on an undefined sheet.
  if (workbook.SheetNames.length === 0) return [];
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
}

export interface SpreadsheetColumn<T> {
  key: keyof T;
  label: string;
}

// Builds an .xlsx or .csv file (as a Buffer) from rows + a header spec — used
// for export and for generating the downloadable import template.
export function buildSpreadsheet<T>(
  rows: T[],
  columns: SpreadsheetColumn<T>[],
  format: SpreadsheetFormat,
): Buffer {
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.label, row[c.key] ?? ""])),
  );
  const sheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bookType = format === "csv" ? "csv" : "xlsx";
  return XLSX.write(workbook, { type: "buffer", bookType }) as Buffer;
}
