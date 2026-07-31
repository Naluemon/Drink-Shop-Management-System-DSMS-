"use client";

import { useMemo, useState, useTransition } from "react";
import { toast, confirmDelete } from "@/lib/sweet-alert";
import { softDeleteRecipe } from "../actions/recipes";
import { exportRecipes } from "../actions/recipe-import-export";
import {
  RecipeFormDialog,
  type RecipeFormValues,
  type SavedRecipeFields,
} from "./recipe-form-dialog";
import { RecipeImportDialog } from "./recipe-import-dialog";
import type { RecipeIngredientRow, IngredientOption } from "./recipe-ingredients-manager";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { ExportMenuButton } from "@/components/export-menu-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, downloadBase64File } from "@/lib/utils";

export interface RecipeRow {
  id: string;
  name: string;
  yield: string;
  cost: number;
  ingredients: RecipeIngredientRow[];
}

interface RecipeListProps {
  initialRecipes: RecipeRow[];
  availableIngredients: IngredientOption[];
  canEdit: boolean;
}

function recomputeCost(
  ingredients: RecipeIngredientRow[],
  yieldStr: string,
  available: IngredientOption[],
) {
  const total = ingredients.reduce((sum, ri) => {
    const ingredient = available.find((i) => i.id === ri.ingredientId);
    return sum + Number(ri.quantity) * Number(ingredient?.costPerUnit ?? 0);
  }, 0);
  const yieldAmount = Number(yieldStr) || 1;
  return total / yieldAmount;
}

// FR-RCP-01..04: CRUD recipe, cost คำนวณสดเสมอ ไม่ cache (ARCHITECTURE.md §3)
export function RecipeList({ initialRecipes, availableIngredients, canEdit }: RecipeListProps) {
  const [recipes, setRecipes] = useState(initialRecipes);
  // Same fix as IngredientList: the import dialog's router.refresh() re-runs
  // the server component with a fresh initialRecipes array, but useState
  // only reads its initializer once. Adjust state during render (React's
  // documented pattern) rather than useEffect — see ingredient-list.tsx's
  // identical comment for the full rationale. The manual create/update/
  // delete flows below never call router.refresh(), so this never clobbers
  // their optimistic local updates.
  const [prevInitialRecipes, setPrevInitialRecipes] = useState(initialRecipes);
  if (initialRecipes !== prevInitialRecipes) {
    setPrevInitialRecipes(initialRecipes);
    setRecipes(initialRecipes);
  }
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();

  function handleExport(format: "xlsx" | "csv") {
    startExportTransition(async () => {
      const result = await exportRecipes(format);
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter(
      (r) => r.name.toLowerCase().includes(term) || r.cost.toFixed(2).includes(term),
    );
  }, [recipes, search]);

  function handleCreated(fields: SavedRecipeFields) {
    setRecipes((prev) =>
      [
        ...prev,
        { id: fields.id, name: fields.name, yield: fields.yield, cost: 0, ingredients: [] },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  function handleUpdated(fields: SavedRecipeFields) {
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === fields.id
          ? {
              ...r,
              name: fields.name,
              yield: fields.yield,
              cost: recomputeCost(r.ingredients, fields.yield, availableIngredients),
            }
          : r,
      ),
    );
  }

  function handleIngredientsChange(recipeId: string, rows: RecipeIngredientRow[]) {
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === recipeId
          ? { ...r, ingredients: rows, cost: recomputeCost(rows, r.yield, availableIngredients) }
          : r,
      ),
    );
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirmDelete({
      title: `ลบสูตร "${name}" ใช่ไหม?`,
      description: "สูตรนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น",
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await softDeleteRecipe(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      toast.success("ลบสูตรสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อสูตร หรือต้นทุน..."
        />
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <RecipeFormDialog
              mode="create"
              availableIngredients={availableIngredients}
              onSaved={handleCreated}
            />
            <RecipeImportDialog />
            <ExportMenuButton onExport={handleExport} disabled={isExporting} />
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อสูตร</TableHead>
            <TableHead>ผลผลิต</TableHead>
            <TableHead>จำนวนวัตถุดิบ</TableHead>
            <TableHead>ต้นทุนต่อ 1 yield</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 6 : 5} className="text-muted-foreground text-center">
                ไม่พบสูตร
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((r, index) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.yield}</TableCell>
                <TableCell>{r.ingredients.length} รายการ</TableCell>
                <TableCell>{formatBaht(r.cost)}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <RecipeFormDialog
                        mode="edit"
                        availableIngredients={availableIngredients}
                        onSaved={handleUpdated}
                        onIngredientsChange={(rows) => handleIngredientsChange(r.id, rows)}
                        initialValues={
                          {
                            id: r.id,
                            name: r.name,
                            yield: r.yield,
                            ingredients: r.ingredients,
                          } satisfies RecipeFormValues
                        }
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(r.id, r.name)}
                      >
                        ลบ
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
