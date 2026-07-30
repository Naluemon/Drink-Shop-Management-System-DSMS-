# Ingredient Import/Export — Design

**Date**: 2026-07-31
**Status**: Draft, pending user review

## 1. Problem

Adding ingredients to DSMS is entirely manual, one row at a time, through `/ingredients`'s create dialog — there is no way to bring in an existing spreadsheet of ingredients a shop already keeps outside the app, and no way to get the current list back out as a file. Two concrete pains reported by the user (2026-07-31):

- Setting up (or bulk-updating) ingredient data means retyping everything by hand into the web form, one ingredient at a time.
- Even after creating an ingredient, it has zero starting stock — the owner must separately visit `/inventory` and record a "stock in" movement before that ingredient has any usable quantity. Confirmed in code: `features/ingredients/actions/ingredients.ts`'s `createIngredient` sets `costPerUnit` but never `currentStockQty`, which defaults to 0 and only ever changes through `recordStockIn`/`recordStockOut`/`recordAdjustment` in `features/inventory/actions/inventory.ts`.

Goal: let an owner/manager import a spreadsheet (Excel or CSV) of ingredients in one step — including their starting stock, so no separate trip to `/inventory` is needed — and export the current ingredient list back out in the same format.

## 2. Scope

**In scope**:

- Import and export for **ingredients only** (confirmed with user — recipes/menus/modifier groups are explicitly deferred; they involve relational structure, e.g. a recipe referencing ingredients + quantities, that a flat spreadsheet row doesn't map to cleanly).
- Both `.xlsx` and `.csv` accepted for import, and offered as two options for export.
- One purchase-unit conversion per ingredient row (e.g. "1 กระสอบ = 1000 กรัม") — confirmed with user as sufficient; an ingredient needing a second purchase unit is added manually afterward through the existing unit-conversion UI, same as today.
- A starting-stock column that, when present, creates a real `stock_in` ledger movement (via the existing `recordStockIn` action) rather than writing `currentStockQty` directly — this both solves the "separate trip to inventory" pain and keeps the append-only ledger invariant (`AGENTS.md` §4) intact.
- Supplier auto-creation: a supplier name in the file that doesn't exist yet gets created automatically during import.
- Duplicate handling: an ingredient name (case-insensitive) that already exists is skipped, not overwritten, and reported to the user.
- A preview step: parse and validate the whole file, show a summary (create / skip / error counts, with per-row detail) **before** writing anything — the user confirms before any DB write happens.
- A downloadable, empty template file with the correct headers.

**Explicitly out of scope this round**:

- Import/export for recipes, menus, or modifier groups (separate future work, per user).
- More than one purchase-unit conversion per ingredient in the file.
- Editing/updating existing ingredients via import (only new ingredients are created; duplicates are skipped, never merged or overwritten).
- Background-job/async processing — a single shop's ingredient list is small enough (low hundreds of rows at most) for a synchronous Server Action; a soft row cap (see §7) keeps this true.

## 3. File columns

One row = one ingredient. Column headers (Thai, matching the rest of the UI):

| Column (Thai header) | Required       | Maps to                                                 | Notes                                                                                  |
| -------------------- | -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ชื่อวัตถุดิบ         | Yes            | `Ingredient.name`                                       | Case-insensitive duplicate check against existing ingredients                          |
| หน่วยฐาน             | Yes            | `Ingredient.baseUnit`                                   | Must be exactly `gram`, `ml`, or `piece` (the only 3 values `BaseUnit` allows, per D2) |
| ต้นทุนต่อหน่วย       | Yes            | `Ingredient.costPerUnit`                                | Number ≥ 0                                                                             |
| สต็อกเริ่มต้น        | No (default 0) | drives a `recordStockIn` call, not a direct field write | Number ≥ 0; 0 or blank means no stock-in movement is created at all                    |
| จุดแจ้งเตือนสต็อกต่ำ | No             | `Ingredient.lowStockThreshold`                          | Number ≥ 0 if present                                                                  |
| ผู้จำหน่าย           | No             | `Supplier.name` (looked up or created)                  | Case-insensitive match against existing suppliers; auto-created if not found           |
| ชื่อหน่วยซื้อ        | No             | `UnitConversion.purchaseUnitName`                       | Must be paired with the next column — both present or both blank                       |
| อัตราแปลงหน่วยซื้อ   | No             | `UnitConversion.conversionFactor`                       | Number > 0; e.g. "กระสอบ" + `1000` means 1 กระสอบ = 1000 (of the base unit)            |

## 4. Import flow

1. Owner/Manager clicks **"นำเข้าไฟล์"** on `/ingredients`, picks a `.xlsx` or `.csv` file.
2. **Validate-only pass** (no DB writes yet): the file is parsed and every row is checked — required fields present, `baseUnit` is one of the 3 allowed values, numeric fields parse and are non-negative, the unit-conversion pair is both-or-neither. Existing ingredient names and supplier names are fetched once up front (case-insensitive lookup maps) so duplicate/match checks don't re-query per row.
3. The user sees a summary before anything is written:
   - "จะสร้างวัตถุดิบใหม่ N รายการ"
   - "ข้าม M รายการ (ชื่อซ้ำกับที่มีอยู่แล้ว)" — with the duplicate names listed
   - "มีปัญหา K แถว" — with row number + reason per problem row (e.g. "แถวที่ 5: หน่วยฐานต้องเป็น gram/ml/piece เท่านั้น")
4. The user clicks **"ยืนยันนำเข้า"** to actually commit. Only rows that passed validation and aren't duplicates get written; problem rows are simply excluded, they never fail the whole batch.
5. Per valid row, in one commit step:
   - Resolve or create the supplier (a name introduced earlier in the same file, for a later row, reuses the supplier created for the earlier row — no duplicate suppliers within one import).
   - Create the `Ingredient` row (`currentStockQty` starts at its schema default of 0, exactly like the manual create-dialog path today).
   - If a unit-conversion pair is present, create the `UnitConversion` row.
   - If starting stock > 0, call the existing `recordStockIn({ ingredientId, quantity, note: "นำเข้าข้อมูลเริ่มต้นจากไฟล์" })` — this is the same function `/inventory`'s stock-in form already calls, so the ledger entry, `currentStockQty` increment, and stock-deficit bookkeeping all behave identically to a manual stock-in. No new stock-mutation logic is written for this feature.

Permissions: reuses the existing checks as-is — `requirePermission(actor.role, "create", "ingredient")` (import creates ingredients) and `requirePermission(actor.role, "create", "stock_in")` (import may create stock-in movements). Both are already Owner/Manager-only in `lib/permissions.ts`'s matrix, and Owner/Manager are the only roles that can reach the ingredient create-dialog today, so this doesn't open any access that role-page-permissions or the CRUD matrix doesn't already gate.

## 5. Export flow

- **"ส่งออกไฟล์"** button on `/ingredients`, offering Excel or CSV.
- Pulls every non-deleted ingredient plus its supplier's name (if any) and its first `UnitConversion` row (if any — matching the one-conversion-per-row scope), into exactly the same column layout as §3, so an exported file can be edited and re-imported unchanged.
- Uses the download mechanism already established in this codebase (`features/reports/components/reports-page-content.tsx`'s `downloadCsv`/`downloadBase64Pdf` pattern: a Server Action returns the file as a string (CSV) or base64 (binary), the client decodes it into a `Blob` and triggers the download via a hidden `<a download>` link) — no new Route Handler or download mechanism is introduced.

## 6. Template

- **"ดาวน์โหลดแม่แบบ"** button — a static, pre-built empty file (headers only, no data rows) for each format, shipped as a static asset (e.g. `public/templates/ingredients-import-template.xlsx` / `.csv`) rather than generated per request, since the column layout doesn't change at runtime.

## 7. New dependency

No existing library in this project parses or writes `.xlsx` (confirmed: `package.json` has no `xlsx`/`exceljs`/similar). This adds **`xlsx`** (SheetJS community edition) as a new dependency — it reads and writes both `.xlsx` and `.csv` through the same API (`XLSX.read`/`XLSX.utils.sheet_to_json` for import, `XLSX.utils.json_to_sheet`/`XLSX.write` for export), so one library covers both formats without a separate CSV parser.

A soft cap of 500 rows per import file is enforced (reject with a clear message above that) — comfortably above what a single shop's ingredient list needs, and keeps the whole operation safely inside a normal Server Action's execution time without needing background-job infrastructure.

## 8. Testing plan

- Unit tests for the row-validation logic: valid row, missing required field, invalid `baseUnit` value, negative numbers, unit-conversion pair with only one side filled, duplicate name (case-insensitive) against a pre-existing ingredient, duplicate name introduced twice within the same file.
- Unit test confirming a row with starting stock > 0 results in exactly one `recordStockIn`-equivalent call with the right `ingredientId`/`quantity`, and a row with starting stock 0 (or blank) results in none.
- Unit test confirming a supplier name reused across two rows in the same file only creates one `Supplier` row.
- e2e (Playwright), one scenario: owner uploads a small file with one new ingredient (with starting stock and a supplier that doesn't exist yet) and one row that duplicates an existing ingredient's name → sees the correct preview counts → confirms → the new ingredient appears in `/ingredients` with the right stock, the new supplier exists, and the duplicate row was skipped.
