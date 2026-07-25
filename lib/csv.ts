// Phase 11 — Reports. FR-RPT-03: CSV export. Pure/client-safe so both the
// report page (client-side download) and any future server route can reuse
// the exact same serialization.

export interface CsvColumn<T> {
  key: keyof T | ((row: T) => string | number);
  label: string;
}

function escapeCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) =>
        escapeCell(typeof c.key === "function" ? c.key(row) : (row[c.key] as string | number)),
      )
      .join(","),
  );
  // Leading BOM so Excel opens Thai (UTF-8) text correctly instead of mojibake.
  return "﻿" + [header, ...lines].join("\r\n");
}
