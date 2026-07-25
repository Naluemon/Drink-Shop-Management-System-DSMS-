"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { softDeleteRecipe } from "../actions/recipes";
import {
  RecipeFormDialog,
  type RecipeFormValues,
  type SavedRecipeFields,
} from "./recipe-form-dialog";
import type { RecipeIngredientRow, IngredientOption } from "./recipe-ingredients-manager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function handleDelete(id: string) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อสูตร หรือต้นทุน..."
          className="max-w-xs"
        />
        {canEdit && (
          <RecipeFormDialog
            mode="create"
            availableIngredients={availableIngredients}
            onSaved={handleCreated}
          />
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อสูตร</TableHead>
            <TableHead>Yield</TableHead>
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
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive" disabled={isPending} />}
                        triggerLabel="ลบ"
                        title={`ลบสูตร "${r.name}" ใช่ไหม?`}
                        description="สูตรนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น"
                        confirmLabel="ลบ"
                        onConfirm={() => handleDelete(r.id)}
                      />
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
