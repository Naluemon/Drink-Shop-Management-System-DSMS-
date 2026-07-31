// One-off/rerunnable generator for the downloadable menu import template
// (header row only, no data). Re-run and re-commit its output whenever
// MENU_IMPORT_COLUMNS changes.
//
// Usage: npx tsx scripts/generate-menu-import-templates.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { MENU_IMPORT_COLUMNS } from "@/features/menus/schemas/menu-import.schema";

const columns = Object.values(MENU_IMPORT_COLUMNS).map((label) => ({
  key: label as never,
  label,
}));

mkdirSync("public/templates", { recursive: true });

const xlsxBuffer = buildSpreadsheet([], columns, "xlsx");
writeFileSync("public/templates/menus-import-template.xlsx", xlsxBuffer);

const csvBuffer = buildSpreadsheet([], columns, "csv");
writeFileSync("public/templates/menus-import-template.csv", csvBuffer);

console.log("Wrote public/templates/menus-import-template.{xlsx,csv}");
