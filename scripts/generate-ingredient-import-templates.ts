// One-off/rerunnable generator for the downloadable ingredient import
// template (header row only, no data). Re-run and re-commit its output
// whenever INGREDIENT_IMPORT_COLUMNS changes.
//
// Usage: npx tsx scripts/generate-ingredient-import-templates.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { INGREDIENT_IMPORT_COLUMNS } from "@/features/ingredients/schemas/ingredient-import.schema";

const columns = Object.values(INGREDIENT_IMPORT_COLUMNS).map((label) => ({
  key: label as never,
  label,
}));

mkdirSync("public/templates", { recursive: true });

const xlsxBuffer = buildSpreadsheet([], columns, "xlsx");
writeFileSync("public/templates/ingredients-import-template.xlsx", xlsxBuffer);

const csvBuffer = buildSpreadsheet([], columns, "csv");
writeFileSync("public/templates/ingredients-import-template.csv", csvBuffer);

console.log("Wrote public/templates/ingredients-import-template.{xlsx,csv}");
