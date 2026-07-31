"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addRecipeIngredient, removeRecipeIngredient } from "../actions/recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

export interface RecipeIngredientRow {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  quantity: string;
}

export interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  costPerUnit: string;
}

interface RecipeIngredientsManagerProps {
  recipeId: string;
  initialIngredients: RecipeIngredientRow[];
  availableIngredients: IngredientOption[];
  onIngredientsChange?: (rows: RecipeIngredientRow[]) => void;
}

// FR-RCP-01: เลือก ingredient + quantity (หน่วยอ้างอิง base_unit ของ ingredient เสมอ)
export function RecipeIngredientsManager({
  recipeId,
  initialIngredients,
  availableIngredients,
  onIngredientsChange,
}: RecipeIngredientsManagerProps) {
  const [rows, setRows] = useState(initialIngredients);

  function updateRows(next: RecipeIngredientRow[]) {
    setRows(next);
    onIngredientsChange?.(next);
  }
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = availableIngredients.find((i) => i.id === ingredientId);

  function handleAdd() {
    if (!ingredientId || !quantity) return;
    setError(null);
    startTransition(async () => {
      const result = await addRecipeIngredient(recipeId, {
        ingredientId,
        quantity: Number(quantity),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.recipeIngredient) {
        updateRows([...rows, result.recipeIngredient]);
        toast.success("เพิ่มวัตถุดิบในสูตรสำเร็จ");
      }
      setIngredientId("");
      setQuantity("");
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeRecipeIngredient(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      updateRows(rows.filter((r) => r.id !== id));
      toast.success("ลบวัตถุดิบในสูตรสำเร็จ");
    });
  }

  return (
    <div className="space-y-3">
      <Label>วัตถุดิบในสูตร</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span>
                {r.ingredientName} — {r.quantity} {BASE_UNIT_LABELS[r.baseUnit] ?? r.baseUnit}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(r.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="ลบวัตถุดิบนี้ออกจากสูตร"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* div, not <form> — nested inside the recipe's own <form> */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="recipe-ingredient-select" className="text-xs">
            วัตถุดิบ
          </Label>
          <Select value={ingredientId} onValueChange={(v) => setIngredientId(v ?? "")}>
            <SelectTrigger id="recipe-ingredient-select" className="w-full">
              <SelectValue placeholder="เลือกวัตถุดิบ">
                {(v: string) =>
                  availableIngredients.find((i) => i.id === v)?.name ?? "เลือกวัตถุดิบ"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableIngredients.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} ({BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="recipe-ingredient-qty" className="text-xs">
            ปริมาณ{selected ? ` (${BASE_UNIT_LABELS[selected.baseUnit] ?? selected.baseUnit})` : ""}
          </Label>
          <Input
            id="recipe-ingredient-qty"
            type="number"
            step="0.0001"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isPending || !ingredientId || !quantity}
          onClick={handleAdd}
        >
          เพิ่ม
        </Button>
      </div>
    </div>
  );
}
