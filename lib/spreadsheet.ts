import * as XLSX from "xlsx";

export type SpreadsheetFormat = "xlsx" | "csv";

// Reads either an .xlsx or .csv file (XLSX.read auto-detects the format from
// the buffer's content) and returns the first sheet's rows as plain objects
// keyed by the header row's cell values. Single place this parsing logic
// lives, reused by the ingredient import feature and any future bulk import.
export function parseSpreadsheet(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
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
