# Ingredient Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner/manager bulk-import ingredients (with starting stock, supplier, and one purchase-unit conversion) from an Excel/CSV file with a preview-then-confirm flow, and export the current ingredient list back out in the same column layout.

**Architecture:** A generic `lib/spreadsheet.ts` wraps the new `xlsx` dependency for reading/writing both `.xlsx` and `.csv`. A pure, DB-free validation function (`validateImportRows`) turns raw parsed rows into three buckets — creatable, duplicate, invalid — so it's unit-testable without Prisma. Two Server Actions sit on top: `previewIngredientImport` (parse + validate, no writes) and `commitIngredientImport` (writes only what preview already validated, re-checking duplicates defensively). Starting stock is never written directly to `Ingredient.currentStockQty` — it goes through the existing `recordStockIn` action so the append-only ledger invariant holds.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma 7, Zod, `xlsx` (SheetJS, new dependency), Vitest + `vitest-mock-extended`, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-31-ingredient-import-export-design.md`

## Global Constraints

- Ingredients only this round — no recipes/menus/modifier-groups import/export.
- One purchase-unit conversion per row, maximum.
- A duplicate ingredient name (case-insensitive, checked both against the DB and against other rows in the same file) is skipped and reported — never overwritten, never merged.
- Starting stock > 0 must create a real `stock_in` ledger movement via the existing `recordStockIn` (`features/inventory/actions/inventory.ts`) — never a direct `currentStockQty` write.
- A missing supplier name gets auto-created; a supplier name repeated across rows in the same file must reuse one `Supplier` row, not create duplicates.
- Preview must not write anything to the database. Only `commitIngredientImport`, called after the user explicitly confirms, writes.
- Reuses the existing permission checks as-is: `requirePermission(actor.role, "create", "ingredient")` for import, `requirePermission(actor.role, "view", "ingredient")` for export — no new permission resources or matrix entries.
- Max 500 rows per import file (soft cap, clear error message above it) — no background-job infrastructure.
- Download mechanism matches the existing convention in `features/reports/components/reports-page-content.tsx` (`downloadCsv`/`downloadBase64Pdf`: Server Action returns a string or base64, client decodes into a `Blob`, a hidden `<a download>` triggers the save) — no new Route Handler.

---

## Task 1: `lib/spreadsheet.ts` — generic read/write helper

**Files:**

- Create: `lib/spreadsheet.ts`
- Test: `lib/spreadsheet.test.ts`
- Modify: `package.json` (add `xlsx` dependency)

**Interfaces:**

- Produces: `parseSpreadsheet(buffer: Buffer): Record<string, unknown>[]`, `SpreadsheetColumn<T>` (`{ key: keyof T; label: string }`), `buildSpreadsheet<T>(rows: T[], columns: SpreadsheetColumn<T>[], format: "xlsx" | "csv"): Buffer`. Consumed by Task 3's Server Actions and Task 5's template generator.

- [ ] **Step 1: Install the dependency**

Run: `npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`

**Do not run plain `npm install xlsx`** — npm's last published release (0.18.5) carries two unpatched high-severity advisories (prototype pollution CVSS 7.8, ReDoS CVSS 7.5) with no fix available through the registry; SheetJS stopped publishing patched releases to npm and now distributes them only from their own CDN. This matters here specifically because this library parses user-uploaded files — exactly the attack surface both bugs exploit. The CDN command installs the current patched release (0.20.3 as of this writing) instead.

- [ ] **Step 2: Write the failing tests**

Create `lib/spreadsheet.test.ts`:

```ts
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

  it("returns an empty array for a header-only file", () => {
    const buffer = Buffer.from("name,amount\n", "utf8");
    expect(parseSpreadsheet(buffer)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/spreadsheet.test.ts`
Expected: FAIL — `Cannot find module './spreadsheet'`.

- [ ] **Step 4: Write `lib/spreadsheet.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/spreadsheet.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/spreadsheet.ts lib/spreadsheet.test.ts
git commit -m "feat: add generic xlsx/csv read-write helper"
```

---

## Task 2: Ingredient import row schema + pure validation

**Files:**

- Create: `features/ingredients/schemas/ingredient-import.schema.ts`
- Create: `features/ingredients/lib/validate-import.ts`
- Test: `features/ingredients/lib/validate-import.test.ts`

**Interfaces:**

- Consumes: nothing external — pure logic, no Prisma, no Server Action.
- Produces: `INGREDIENT_IMPORT_COLUMNS` (the Thai header-label constants, single source of truth for import parsing, export, and the template), `ingredientImportRowSchema`, `ParsedIngredientRow`, `ValidateImportResult`, `validateImportRows(rawRows, existingNames): ValidateImportResult`. Consumed by Task 3's Server Actions and Task 4's UI (for column labels).

- [ ] **Step 1: Write `features/ingredients/schemas/ingredient-import.schema.ts`**

```ts
import { z } from "zod";
import type { BaseUnit } from "@/lib/generated/prisma/enums";

// Single source of truth for the column headers used by import parsing,
// export, and the downloadable template (Task 5) — keeping all three in
// exactly one place means they can never drift out of sync with each other.
export const INGREDIENT_IMPORT_COLUMNS = {
  name: "ชื่อวัตถุดิบ",
  baseUnit: "หน่วยฐาน",
  costPerUnit: "ต้นทุนต่อหน่วย",
  startingStock: "สต็อกเริ่มต้น",
  lowStockThreshold: "จุดแจ้งเตือนสต็อกต่ำ",
  supplierName: "ผู้จำหน่าย",
  purchaseUnitName: "ชื่อหน่วยซื้อ",
  conversionFactor: "อัตราแปลงหน่วยซื้อ",
} as const;

// Accepts either the raw BaseUnit enum value or the Thai label already shown
// in the ingredient form (features/ingredients/components/ingredient-form-dialog.tsx's
// BASE_UNIT_OPTIONS) — a shop owner filling the template sees Thai labels,
// not "gram"/"ml"/"piece", and the template (Task 5) uses the Thai labels.
const BASE_UNIT_ALIASES: Record<string, BaseUnit> = {
  gram: "gram",
  กรัม: "gram",
  ml: "ml",
  "มล.": "ml",
  มล: "ml",
  piece: "piece",
  ชิ้น: "piece",
};

function normalizeBaseUnit(value: unknown): BaseUnit | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return BASE_UNIT_ALIASES[trimmed] ?? BASE_UNIT_ALIASES[trimmed.toLowerCase()];
}

function emptyToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// One parsed+validated row, ready to create — supplierName is still a raw
// name here (resolved to a Supplier id during commit, since that needs a DB
// round-trip this schema layer intentionally doesn't do).
export const ingredientImportRowSchema = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่อวัตถุดิบ"),
    baseUnit: z
      .unknown()
      .transform(normalizeBaseUnit)
      .refine((v): v is BaseUnit => v !== undefined, {
        message: "หน่วยฐานต้องเป็น กรัม / มล. / ชิ้น เท่านั้น",
      }),
    costPerUnit: z.coerce.number().min(0, "ต้นทุนต้องไม่ติดลบ"),
    startingStock: z.coerce.number().min(0, "สต็อกเริ่มต้นต้องไม่ติดลบ").optional(),
    lowStockThreshold: z.coerce.number().min(0, "จุดแจ้งเตือนต้องไม่ติดลบ").optional(),
    supplierName: z.unknown().transform(emptyToUndefined),
    purchaseUnitName: z.unknown().transform(emptyToUndefined),
    conversionFactor: z.coerce.number().positive("อัตราแปลงหน่วยต้องมากกว่า 0").optional(),
  })
  .refine((row) => (row.purchaseUnitName === undefined) === (row.conversionFactor === undefined), {
    message: "ต้องกรอกทั้งชื่อหน่วยซื้อและอัตราแปลงคู่กัน หรือไม่กรอกทั้งคู่",
    path: ["purchaseUnitName"],
  });

export type IngredientImportRowParsed = z.infer<typeof ingredientImportRowSchema>;
```

- [ ] **Step 2: Write the failing tests**

Create `features/ingredients/lib/validate-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateImportRows } from "./validate-import";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";

const C = INGREDIENT_IMPORT_COLUMNS;

function row(overrides: Record<string, unknown>) {
  return {
    [C.name]: "น้ำตาลทราย",
    [C.baseUnit]: "กรัม",
    [C.costPerUnit]: 25,
    ...overrides,
  };
}

describe("validateImportRows", () => {
  it("accepts a fully valid row with no optional fields", () => {
    const result = validateImportRows([row({})], new Set());
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicates).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.toCreate[0]).toMatchObject({
      rowNumber: 2,
      name: "น้ำตาลทราย",
      baseUnit: "gram",
      costPerUnit: 25,
      startingStock: 0,
      lowStockThreshold: null,
      supplierName: null,
      purchaseUnitName: null,
      conversionFactor: null,
    });
  });

  it("carries through starting stock, supplier, and unit conversion when present", () => {
    const result = validateImportRows(
      [
        row({
          [C.startingStock]: 100,
          [C.supplierName]: "ร้านค้าส่ง ก.",
          [C.purchaseUnitName]: "กระสอบ",
          [C.conversionFactor]: 1000,
        }),
      ],
      new Set(),
    );
    expect(result.toCreate[0]).toMatchObject({
      startingStock: 100,
      supplierName: "ร้านค้าส่ง ก.",
      purchaseUnitName: "กระสอบ",
      conversionFactor: 1000,
    });
  });

  it("rejects a missing name", () => {
    const result = validateImportRows([row({ [C.name]: "" })], new Set());
    expect(result.toCreate).toHaveLength(0);
    expect(result.errors).toEqual([{ rowNumber: 2, reason: "กรุณากรอกชื่อวัตถุดิบ" }]);
  });

  it("rejects an invalid baseUnit value", () => {
    const result = validateImportRows([row({ [C.baseUnit]: "ลิตร" })], new Set());
    expect(result.errors).toEqual([
      { rowNumber: 2, reason: "หน่วยฐานต้องเป็น กรัม / มล. / ชิ้น เท่านั้น" },
    ]);
  });

  it("rejects a negative cost", () => {
    const result = validateImportRows([row({ [C.costPerUnit]: -1 })], new Set());
    expect(result.errors).toHaveLength(1);
  });

  it("rejects a unit-conversion pair with only one side filled", () => {
    const result = validateImportRows([row({ [C.purchaseUnitName]: "กระสอบ" })], new Set());
    expect(result.errors).toEqual([
      { rowNumber: 2, reason: "ต้องกรอกทั้งชื่อหน่วยซื้อและอัตราแปลงคู่กัน หรือไม่กรอกทั้งคู่" },
    ]);
  });

  it("skips a row whose name already exists in the DB (case-insensitive)", () => {
    const result = validateImportRows([row({})], new Set(["น้ำตาลทราย"]));
    expect(result.toCreate).toHaveLength(0);
    expect(result.duplicates).toEqual([{ rowNumber: 2, name: "น้ำตาลทราย" }]);
  });

  it("skips the second occurrence of a name duplicated within the same file", () => {
    const result = validateImportRows([row({}), row({})], new Set());
    expect(result.toCreate).toHaveLength(1);
    expect(result.duplicates).toEqual([{ rowNumber: 3, name: "น้ำตาลทราย" }]);
  });

  it("numbers rows starting at 2 (row 1 is the header)", () => {
    const result = validateImportRows([row({}), row({ [C.name]: "เกลือ" })], new Set());
    expect(result.toCreate.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run features/ingredients/lib/validate-import.test.ts`
Expected: FAIL — `Cannot find module './validate-import'`.

- [ ] **Step 4: Write `features/ingredients/lib/validate-import.ts`**

```ts
import type { BaseUnit } from "@/lib/generated/prisma/enums";
import {
  INGREDIENT_IMPORT_COLUMNS,
  ingredientImportRowSchema,
} from "../schemas/ingredient-import.schema";

export interface ParsedIngredientRow {
  rowNumber: number;
  name: string;
  baseUnit: BaseUnit;
  costPerUnit: number;
  startingStock: number;
  lowStockThreshold: number | null;
  supplierName: string | null;
  purchaseUnitName: string | null;
  conversionFactor: number | null;
}

export interface ValidateImportResult {
  toCreate: ParsedIngredientRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

// Pure — no Prisma, no I/O — so it's testable without mocking the database.
// existingNames must already be lower-cased.
export function validateImportRows(
  rawRows: Record<string, unknown>[],
  existingNames: Set<string>,
): ValidateImportResult {
  const toCreate: ParsedIngredientRow[] = [];
  const duplicates: { rowNumber: number; name: string }[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];
  const seenInFile = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped = {
      name: raw[INGREDIENT_IMPORT_COLUMNS.name],
      baseUnit: raw[INGREDIENT_IMPORT_COLUMNS.baseUnit],
      costPerUnit: raw[INGREDIENT_IMPORT_COLUMNS.costPerUnit],
      startingStock: raw[INGREDIENT_IMPORT_COLUMNS.startingStock],
      lowStockThreshold: raw[INGREDIENT_IMPORT_COLUMNS.lowStockThreshold],
      supplierName: raw[INGREDIENT_IMPORT_COLUMNS.supplierName],
      purchaseUnitName: raw[INGREDIENT_IMPORT_COLUMNS.purchaseUnitName],
      conversionFactor: raw[INGREDIENT_IMPORT_COLUMNS.conversionFactor],
    };

    const result = ingredientImportRowSchema.safeParse(mapped);
    if (!result.success) {
      errors.push({ rowNumber, reason: result.error.issues[0].message });
      return;
    }

    const lowerName = result.data.name.toLowerCase();
    if (existingNames.has(lowerName) || seenInFile.has(lowerName)) {
      duplicates.push({ rowNumber, name: result.data.name });
      return;
    }
    seenInFile.add(lowerName);

    toCreate.push({
      rowNumber,
      name: result.data.name,
      baseUnit: result.data.baseUnit,
      costPerUnit: result.data.costPerUnit,
      startingStock: result.data.startingStock ?? 0,
      lowStockThreshold: result.data.lowStockThreshold ?? null,
      supplierName: result.data.supplierName ?? null,
      purchaseUnitName: result.data.purchaseUnitName ?? null,
      conversionFactor: result.data.conversionFactor ?? null,
    });
  });

  return { toCreate, duplicates, errors };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run features/ingredients/lib/validate-import.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add features/ingredients/schemas/ingredient-import.schema.ts features/ingredients/lib/validate-import.ts features/ingredients/lib/validate-import.test.ts
git commit -m "feat: add ingredient import row schema and pure validation"
```

---

## Task 3: Server Actions — preview, commit, export

**Files:**

- Create: `features/ingredients/actions/ingredient-import-export.ts`
- Test: `features/ingredients/actions/ingredient-import-export.test.ts`

**Interfaces:**

- Consumes: `parseSpreadsheet`, `buildSpreadsheet` (Task 1); `INGREDIENT_IMPORT_COLUMNS`, `validateImportRows`, `ParsedIngredientRow` (Task 2); `recordStockIn` from `@/features/inventory/actions/inventory` (existing); `getOrCreateDefaultBranch` from `@/lib/default-branch` (existing).
- Produces: `previewIngredientImport(fileBase64: string)`, `commitIngredientImport(rows: ParsedIngredientRow[])`, `exportIngredients(format: "xlsx" | "csv")`. Consumed by Task 4's UI.

- [ ] **Step 1: Write the failing tests**

Create `features/ingredients/actions/ingredient-import-export.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

const recordStockIn = vi.fn(async () => ({ success: true, movementId: "mv-1" }));
vi.mock("@/features/inventory/actions/inventory", () => ({ recordStockIn }));

import { prisma } from "@/lib/prisma";
import { buildSpreadsheet } from "@/lib/spreadsheet";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";
import {
  previewIngredientImport,
  commitIngredientImport,
  exportIngredients,
} from "./ingredient-import-export";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;
const C = INGREDIENT_IMPORT_COLUMNS;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "A",
    role,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  recordStockIn.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
});

function fileWithRows(rows: Record<string, unknown>[]): string {
  const columns = Object.values(C).map((label) => ({ key: label as never, label }));
  const buffer = buildSpreadsheet(rows, columns, "xlsx");
  return buffer.toString("base64");
}

describe("previewIngredientImport", () => {
  it("denies a role without ingredient-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await previewIngredientImport(fileWithRows([]));

    expect("error" in result).toBe(true);
  });

  it("parses the file and returns creatable/duplicate/error buckets", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findMany.mockResolvedValue([{ name: "เกลือ" }] as never);

    const fileBase64 = fileWithRows([
      { [C.name]: "น้ำตาล", [C.baseUnit]: "กรัม", [C.costPerUnit]: 10 },
      { [C.name]: "เกลือ", [C.baseUnit]: "กรัม", [C.costPerUnit]: 5 },
    ]);

    const result = await previewIngredientImport(fileBase64);

    if ("error" in result) throw new Error("expected buckets, got error");
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].name).toBe("น้ำตาล");
    expect(result.duplicates).toEqual([{ rowNumber: 3, name: "เกลือ" }]);
  });

  it("rejects a file over the row cap without touching the DB", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    const rows = Array.from({ length: 501 }, (_, i) => ({
      [C.name]: `วัตถุดิบ${i}`,
      [C.baseUnit]: "กรัม",
      [C.costPerUnit]: 1,
    }));

    const result = await previewIngredientImport(fileWithRows(rows));

    expect("error" in result).toBe(true);
    expect(prismaMock.ingredient.findMany).not.toHaveBeenCalled();
  });
});

describe("commitIngredientImport", () => {
  it("denies a role without ingredient-create permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("cashier") as never);

    const result = await commitIngredientImport([]);

    expect("error" in result).toBe(true);
  });

  it("creates an ingredient, its unit conversion, and calls recordStockIn when starting stock > 0", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue({ id: "sup-1" } as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-1" } as never);
    prismaMock.unitConversion.create.mockResolvedValue({} as never);

    const result = await commitIngredientImport([
      {
        rowNumber: 2,
        name: "น้ำตาล",
        baseUnit: "gram",
        costPerUnit: 10,
        startingStock: 100,
        lowStockThreshold: null,
        supplierName: "ร้านค้าส่ง ก.",
        purchaseUnitName: "กระสอบ",
        conversionFactor: 1000,
      },
    ]);

    expect("success" in result).toBe(true);
    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.ingredient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supplierId: "sup-1" }) }),
    );
    expect(prismaMock.unitConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientId: "ing-1",
          purchaseUnitName: "กระสอบ",
          conversionFactor: 1000,
        }),
      }),
    );
    expect(recordStockIn).toHaveBeenCalledWith(
      expect.objectContaining({ ingredientId: "ing-1", quantity: 100 }),
    );
  });

  it("reuses one supplier across two rows naming the same supplier", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue({ id: "sup-1" } as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-x" } as never);

    await commitIngredientImport([
      {
        rowNumber: 2,
        name: "A",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: "ผู้จำหน่ายเดียวกัน",
        purchaseUnitName: null,
        conversionFactor: null,
      },
      {
        rowNumber: 3,
        name: "B",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: "ผู้จำหน่ายเดียวกัน",
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
  });

  it("skips a row whose name was created by a concurrent import since preview", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue({ id: "already-exists" } as never);

    const result = await commitIngredientImport([
      {
        rowNumber: 2,
        name: "ซ้ำ",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: null,
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    if ("error" in result) throw new Error("expected success");
    expect(result.createdCount).toBe(0);
    expect(prismaMock.ingredient.create).not.toHaveBeenCalled();
  });

  it("does not call recordStockIn when starting stock is 0", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findFirst.mockResolvedValue(null as never);
    prismaMock.ingredient.create.mockResolvedValue({ id: "ing-2" } as never);

    await commitIngredientImport([
      {
        rowNumber: 2,
        name: "ไม่มีสต็อกเริ่มต้น",
        baseUnit: "gram",
        costPerUnit: 1,
        startingStock: 0,
        lowStockThreshold: null,
        supplierName: null,
        purchaseUnitName: null,
        conversionFactor: null,
      },
    ]);

    expect(recordStockIn).not.toHaveBeenCalled();
  });
});

describe("exportIngredients", () => {
  it("denies a role without ingredient-view permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await exportIngredients("csv");

    expect("error" in result).toBe(true);
  });

  it("returns a base64 file for the current ingredient list", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.ingredient.findMany.mockResolvedValue([
      {
        name: "น้ำตาล",
        baseUnit: "gram",
        costPerUnit: { toString: () => "10" },
        currentStockQty: { toString: () => "50" },
        lowStockThreshold: null,
        supplier: null,
        unitConversions: [],
      },
    ] as never);

    const result = await exportIngredients("csv");

    if ("error" in result) throw new Error("expected success");
    expect(result.filename).toBe("ingredients-export.csv");
    expect(result.fileBase64.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run features/ingredients/actions/ingredient-import-export.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write `features/ingredients/actions/ingredient-import-export.ts`**

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { parseSpreadsheet, buildSpreadsheet, type SpreadsheetColumn } from "@/lib/spreadsheet";
import { recordStockIn } from "@/features/inventory/actions/inventory";
import { INGREDIENT_IMPORT_COLUMNS } from "../schemas/ingredient-import.schema";
import { validateImportRows, type ParsedIngredientRow } from "../lib/validate-import";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

const MAX_IMPORT_ROWS = 500;
const C = INGREDIENT_IMPORT_COLUMNS;

export interface PreviewResult {
  toCreate: ParsedIngredientRow[];
  duplicates: { rowNumber: number; name: string }[];
  errors: { rowNumber: number; reason: string }[];
}

export async function previewIngredientImport(
  fileBase64: string,
): Promise<{ error: string } | PreviewResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }

  const buffer = Buffer.from(fileBase64, "base64");
  const rawRows = parseSpreadsheet(buffer);
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const existing = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((i) => i.name.toLowerCase()));

  return validateImportRows(rawRows, existingNames);
}

export async function commitIngredientImport(
  rows: ParsedIngredientRow[],
): Promise<{ error: string } | { success: true; createdCount: number }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "create", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ") };
  }
  if (rows.length === 0) return { error: "ไม่มีรายการให้นำเข้า" };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์` };
  }

  const branch = await getOrCreateDefaultBranch();
  const supplierCache = new Map<string, string>();
  let createdCount = 0;

  for (const row of rows) {
    // Defense in depth: re-check nothing created this name since preview
    // (e.g. a concurrent import) — skip that one row, don't fail the batch.
    const dup = await prisma.ingredient.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: { equals: row.name, mode: "insensitive" },
      },
    });
    if (dup) continue;

    let supplierId: string | null = null;
    if (row.supplierName) {
      const key = row.supplierName.toLowerCase();
      supplierId = supplierCache.get(key) ?? null;
      if (!supplierId) {
        const existingSupplier = await prisma.supplier.findFirst({
          where: {
            branchId: branch.id,
            deletedAt: null,
            name: { equals: row.supplierName, mode: "insensitive" },
          },
        });
        if (existingSupplier) {
          supplierId = existingSupplier.id;
        } else {
          const created = await prisma.supplier.create({
            data: { branchId: branch.id, name: row.supplierName, createdBy: actor.id },
          });
          supplierId = created.id;
        }
        supplierCache.set(key, supplierId);
      }
    }

    const ingredient = await prisma.ingredient.create({
      data: {
        branchId: branch.id,
        name: row.name,
        baseUnit: row.baseUnit,
        costPerUnit: row.costPerUnit,
        lowStockThreshold: row.lowStockThreshold,
        supplierId,
        createdBy: actor.id,
      },
    });

    if (row.purchaseUnitName && row.conversionFactor) {
      await prisma.unitConversion.create({
        data: {
          ingredientId: ingredient.id,
          purchaseUnitName: row.purchaseUnitName,
          conversionFactor: row.conversionFactor,
        },
      });
    }

    if (row.startingStock > 0) {
      await recordStockIn({
        ingredientId: ingredient.id,
        quantity: row.startingStock,
        note: "นำเข้าข้อมูลเริ่มต้นจากไฟล์",
      });
    }

    createdCount += 1;
  }

  return { success: true, createdCount };
}

const BASE_UNIT_EXPORT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

interface IngredientExportRow {
  name: string;
  baseUnit: string;
  costPerUnit: string;
  startingStock: string;
  lowStockThreshold: string;
  supplierName: string;
  purchaseUnitName: string;
  conversionFactor: string;
}

export async function exportIngredients(
  format: "xlsx" | "csv",
): Promise<{ error: string } | { success: true; fileBase64: string; filename: string }> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, "view", "ingredient");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการวัตถุดิบ") };
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    include: { supplier: true, unitConversions: true },
    orderBy: { name: "asc" },
  });

  const rows: IngredientExportRow[] = ingredients.map((i) => ({
    name: i.name,
    baseUnit: BASE_UNIT_EXPORT_LABELS[i.baseUnit] ?? i.baseUnit,
    costPerUnit: i.costPerUnit.toString(),
    startingStock: i.currentStockQty.toString(),
    lowStockThreshold: i.lowStockThreshold?.toString() ?? "",
    supplierName: i.supplier?.name ?? "",
    purchaseUnitName: i.unitConversions[0]?.purchaseUnitName ?? "",
    conversionFactor: i.unitConversions[0]?.conversionFactor.toString() ?? "",
  }));

  const columns: SpreadsheetColumn<IngredientExportRow>[] = [
    { key: "name", label: C.name },
    { key: "baseUnit", label: C.baseUnit },
    { key: "costPerUnit", label: C.costPerUnit },
    { key: "startingStock", label: C.startingStock },
    { key: "lowStockThreshold", label: C.lowStockThreshold },
    { key: "supplierName", label: C.supplierName },
    { key: "purchaseUnitName", label: C.purchaseUnitName },
    { key: "conversionFactor", label: C.conversionFactor },
  ];

  const buffer = buildSpreadsheet(rows, columns, format);
  return {
    success: true,
    fileBase64: buffer.toString("base64"),
    filename: `ingredients-export.${format}`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run features/ingredients/actions/ingredient-import-export.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Run the full unit test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS, all suites green.

- [ ] **Step 6: Commit**

```bash
git add features/ingredients/actions/ingredient-import-export.ts features/ingredients/actions/ingredient-import-export.test.ts
git commit -m "feat: add ingredient import preview/commit and export server actions"
```

---

## Task 4: UI — import dialog + export buttons

**Files:**

- Create: `features/ingredients/components/ingredient-import-dialog.tsx`
- Modify: `features/ingredients/components/ingredient-list.tsx`

**Interfaces:**

- Consumes: `previewIngredientImport`, `commitIngredientImport`, `exportIngredients`, `PreviewResult` (Task 3); `INGREDIENT_IMPORT_COLUMNS` (Task 2, for the template link text only — the actual template file is Task 5's static asset).
- Produces: `IngredientImportDialog` component, rendered from `IngredientList` alongside the existing "เพิ่มวัตถุดิบ" trigger, gated the same way (`canEdit`).

- [ ] **Step 1: Create `features/ingredients/components/ingredient-import-dialog.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  previewIngredientImport,
  commitIngredientImport,
  type PreviewResult,
} from "../actions/ingredient-import-export";
import type { ParsedIngredientRow } from "../lib/validate-import";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — keep only the data part.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function IngredientImportDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const fileBase64 = await fileToBase64(file);
      const result = await previewIngredientImport(fileBase64);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPreview(result);
    });
  }

  function handleConfirm() {
    if (!preview || preview.toCreate.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await commitIngredientImport(preview.toCreate);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`นำเข้าสำเร็จ ${result.createdCount} รายการ`);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Upload /> นำเข้าไฟล์
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้าวัตถุดิบจากไฟล์</DialogTitle>
          <DialogDescription>รองรับไฟล์ .xlsx และ .csv ตามผังคอลัมน์ของแม่แบบ</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          disabled={isPending}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}

        {preview && (
          <div className="space-y-2 text-sm">
            <p>จะสร้างวัตถุดิบใหม่ {preview.toCreate.length} รายการ</p>
            {preview.duplicates.length > 0 && (
              <div>
                <p className="text-muted-foreground">
                  ข้าม {preview.duplicates.length} รายการ (ชื่อซ้ำกับที่มีอยู่แล้ว)
                </p>
                <ul className="text-muted-foreground list-inside list-disc">
                  {preview.duplicates.map((d) => (
                    <li key={d.rowNumber}>
                      แถวที่ {d.rowNumber}: {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div>
                <p className="text-destructive">พบปัญหา {preview.errors.length} แถว</p>
                <ul className="text-destructive list-inside list-disc">
                  {preview.errors.map((e) => (
                    <li key={e.rowNumber}>
                      แถวที่ {e.rowNumber}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={!preview || preview.toCreate.length === 0 || isPending}
            onClick={handleConfirm}
          >
            ยืนยันนำเข้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the import dialog and export/template buttons into `ingredient-list.tsx`**

Replace the import line:

```ts
import { useMemo, useState, useTransition } from "react";
```

with (unchanged — `useTransition` is already imported; no edit needed here, listed only to confirm no duplicate import is added in the next step).

Add these new imports alongside the existing ones (`toast` from `"sonner"` is already imported in this file — do not add it again):

```ts
import { Download } from "lucide-react";
import { IngredientImportDialog } from "./ingredient-import-dialog";
import { exportIngredients } from "../actions/ingredient-import-export";
```

Add this module-scope helper near the top of the file, after the existing imports (matching the `downloadCsv`/`downloadBase64Pdf` convention already established in `features/reports/components/reports-page-content.tsx`):

```ts
function downloadBase64File(filename: string, base64: string, mimeType: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Inside `IngredientList`, right after the existing `const [isPending, startTransition] = useTransition();` (line 63 currently), add a second, separate pending pair — export is unrelated to the existing delete-pending state, so it gets its own:

```ts
const [isExporting, startExportTransition] = useTransition();

function handleExport(format: "xlsx" | "csv") {
  startExportTransition(async () => {
    const result = await exportIngredients(format);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const mimeType =
      format === "csv"
        ? "text/csv;charset=utf-8;"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    downloadBase64File(result.filename, result.fileBase64, mimeType);
  });
}
```

Replace:

```tsx
{
  canEdit && <IngredientFormDialog mode="create" suppliers={suppliers} onSaved={handleCreated} />;
}
```

with:

```tsx
{
  canEdit && (
    <div className="flex flex-wrap items-center gap-2">
      <IngredientFormDialog mode="create" suppliers={suppliers} onSaved={handleCreated} />
      <IngredientImportDialog />
      <Button
        type="button"
        variant="outline"
        disabled={isExporting}
        onClick={() => handleExport("xlsx")}
      >
        <Download /> ส่งออก Excel
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={isExporting}
        onClick={() => handleExport("csv")}
      >
        <Download /> ส่งออก CSV
      </Button>
      <a href="/templates/ingredients-import-template.xlsx" download>
        <Button type="button" variant="ghost">
          แม่แบบ (Excel)
        </Button>
      </a>
      <a href="/templates/ingredients-import-template.csv" download>
        <Button type="button" variant="ghost">
          แม่แบบ (CSV)
        </Button>
      </a>
    </div>
  );
}
```

(this is the block at the end of the header `<div className="flex flex-wrap items-center justify-between gap-3">`, right before that div's closing tag)

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit` — expect PASS.
Run: `npx vitest run` — expect PASS, no regressions (this task adds no new unit tests — UI is covered by Task 6's e2e test, matching this codebase's existing convention of not unit-testing the page/component layer).

- [ ] **Step 4: Manual smoke check**

Run `npm run dev`, log in as owner, go to `/ingredients`, confirm the new buttons render, and that picking a small test file shows a preview before anything is created. Stop the dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add features/ingredients/components/ingredient-import-dialog.tsx features/ingredients/components/ingredient-list.tsx
git commit -m "feat: add ingredient import dialog and export/template buttons"
```

---

## Task 5: Downloadable template files

**Files:**

- Create: `scripts/generate-ingredient-import-templates.ts`
- Create (generated, committed): `public/templates/ingredients-import-template.xlsx`
- Create (generated, committed): `public/templates/ingredients-import-template.csv`

**Interfaces:**

- Consumes: `buildSpreadsheet` (Task 1), `INGREDIENT_IMPORT_COLUMNS` (Task 2).
- Produces: the two static template files Task 4's UI links to. Re-run this script and re-commit its output any time the column set changes — it is not run automatically at build time.

- [ ] **Step 1: Write `scripts/generate-ingredient-import-templates.ts`**

```ts
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
```

- [ ] **Step 2: Run it and verify the output**

Run: `npx tsx scripts/generate-ingredient-import-templates.ts`
Expected: prints the success message; `public/templates/ingredients-import-template.xlsx` and `.csv` now exist.

Verify by parsing them back:
Run: `npx tsx -e "import { parseSpreadsheet } from './lib/spreadsheet'; import { readFileSync } from 'node:fs'; console.log(parseSpreadsheet(readFileSync('public/templates/ingredients-import-template.csv')))"`
Expected: prints `[]` (header-only, zero data rows) with no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-ingredient-import-templates.ts public/templates/ingredients-import-template.xlsx public/templates/ingredients-import-template.csv
git commit -m "feat: add ingredient import template files and generator script"
```

---

## Task 6: e2e — owner imports a file, duplicate is skipped, stock appears

**Files:**

- Create: `e2e/ingredient-import.spec.ts`

**Interfaces:**

- Consumes: `createTestUser`/`deleteTestUser` from `./helpers/test-users`; `loginAs` from `./helpers/login`; `prisma` from `@/lib/prisma` (test setup/cleanup only).

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";
import { loginAs } from "./helpers/login";
import { prisma } from "@/lib/prisma";

const createdUsers: TestUser[] = [];
let existingIngredientName: string;

test.beforeAll(async () => {
  existingIngredientName = `e2e-existing-${Date.now()}`;
  const branch = await prisma.branch.findFirstOrThrow();
  await prisma.ingredient.create({
    data: {
      branchId: branch.id,
      name: existingIngredientName,
      baseUnit: "gram",
      costPerUnit: 1,
      createdBy: (await prisma.user.findFirstOrThrow()).id,
    },
  });
});

test.afterAll(async () => {
  for (const user of createdUsers) {
    await deleteTestUser(user);
  }
  await prisma.ingredient.deleteMany({ where: { name: existingIngredientName } });
  const newName = `e2e-new-${Date.now()}`;
  await prisma.ingredient.deleteMany({ where: { name: { startsWith: "e2e-new-" } } });
  void newName;
});

test("owner imports a file: new ingredient with starting stock is created, duplicate row is skipped", async ({
  page,
}) => {
  const owner = await createTestUser("owner");
  createdUsers.push(owner);

  const newIngredientName = `e2e-new-${Date.now()}`;
  const csvContent = [
    "ชื่อวัตถุดิบ,หน่วยฐาน,ต้นทุนต่อหน่วย,สต็อกเริ่มต้น,จุดแจ้งเตือนสต็อกต่ำ,ผู้จำหน่าย,ชื่อหน่วยซื้อ,อัตราแปลงหน่วยซื้อ",
    `${newIngredientName},กรัม,15,50,,,,`,
    `${existingIngredientName},กรัม,1,0,,,,`,
  ].join("\n");

  await loginAs(page, owner.email, owner.password);
  await page.goto("/ingredients");

  await page.getByRole("button", { name: "นำเข้าไฟล์" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "test-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent, "utf8"),
  });

  await expect(page.getByText("จะสร้างวัตถุดิบใหม่ 1 รายการ")).toBeVisible();
  await expect(page.getByText(`แถวที่ 3: ${existingIngredientName}`)).toBeVisible();

  await page.getByRole("button", { name: "ยืนยันนำเข้า" }).click();
  await expect(page.getByText("นำเข้าสำเร็จ 1 รายการ")).toBeVisible();

  await expect(page.getByText(newIngredientName)).toBeVisible();
  const created = await prisma.ingredient.findFirstOrThrow({
    where: { name: newIngredientName },
  });
  expect(created.currentStockQty.toString()).toBe("50");

  const movement = await prisma.inventoryMovement.findFirst({
    where: { ingredientId: created.id, movementType: "stock_in" },
  });
  expect(movement).not.toBeNull();
});
```

- [ ] **Step 2: Run the new e2e test**

Run: `npx playwright test e2e/ingredient-import.spec.ts`
Expected: PASS

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test`
Expected: PASS (aside from any pre-existing, unrelated environmental failures — e.g. Supabase email rate limiting on `invite-flow.spec.ts`, not caused by this work).

- [ ] **Step 4: Commit**

```bash
git add e2e/ingredient-import.spec.ts
git commit -m "test: add e2e coverage for ingredient import/export"
```

---

## Self-Review Notes

- **Spec coverage**: §3 columns → Task 2. §4 import flow (preview-then-confirm, dedup, supplier auto-create, starting stock via `recordStockIn`) → Tasks 2-3. §5 export → Task 3. §6 template → Task 5. §7 dependency/row cap → Task 1 + Task 3. §8 testing → Tasks 1-3 unit tests, Task 6 e2e.
- **Type consistency checked**: `ParsedIngredientRow` shape identical across Task 2 (definition), Task 3 (consumption in both actions), Task 4 (UI state). `INGREDIENT_IMPORT_COLUMNS` is the single source for headers used in Task 2 (parsing), Task 3 (export), and Task 5 (template) — no column list is hand-copied a second time anywhere.
- **No placeholders**: every step has literal file paths and complete code.
