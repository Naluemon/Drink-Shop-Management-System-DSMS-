// One-off/rerunnable generator for the downloadable recipe import template
// (header row only, no data). Re-run and re-commit its output whenever
// RECIPE_IMPORT_COLUMNS changes.
//
// Usage: npx tsx scripts/generate-recipe-import-templates.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { RECIPE_IMPORT_COLUMNS } from "@/features/recipes/schemas/recipe-import.schema";

const columns = Object.values(RECIPE_IMPORT_COLUMNS).map((label) => ({
  key: label as never,
  label,
}));

mkdirSync("public/templates", { recursive: true });

const xlsxBuffer = buildSpreadsheet([], columns, "xlsx");
writeFileSync("public/templates/recipes-import-template.xlsx", xlsxBuffer);

const csvBuffer = buildSpreadsheet([], columns, "csv");
writeFileSync("public/templates/recipes-import-template.csv", csvBuffer);

console.log("Wrote public/templates/recipes-import-template.{xlsx,csv}");
