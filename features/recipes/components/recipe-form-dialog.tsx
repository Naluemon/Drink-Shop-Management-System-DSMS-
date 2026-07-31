"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { Plus, Pencil } from "lucide-react";
import { createRecipe, updateRecipe } from "../actions/recipes";
import {
  RecipeIngredientsManager,
  type RecipeIngredientRow,
  type IngredientOption,
} from "./recipe-ingredients-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface RecipeFormValues {
  id?: string;
  name: string;
  yield: string;
  ingredients: RecipeIngredientRow[];
}

export interface SavedRecipeFields {
  id: string;
  name: string;
  yield: string;
}

interface RecipeFormDialogProps {
  mode: "create" | "edit";
  initialValues?: RecipeFormValues;
  availableIngredients: IngredientOption[];
  onSaved?: (fields: SavedRecipeFields) => void;
  onIngredientsChange?: (rows: RecipeIngredientRow[]) => void;
}

export function RecipeFormDialog({
  mode,
  initialValues,
  availableIngredients,
  onSaved,
  onIngredientsChange,
}: RecipeFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [yieldAmount, setYieldAmount] = useState(initialValues?.yield ?? "1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, yield: Number(yieldAmount) };

      let id: string;
      if (mode === "create") {
        const result = await createRecipe(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.recipe!.id;
      } else {
        const result = await updateRecipe(initialValues!.id!, input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = initialValues!.id!;
      }

      onSaved?.({ id, name, yield: yieldAmount });
      toast.success(mode === "create" ? "เพิ่มสูตรสำเร็จ" : "แก้ไขสูตรสำเร็จ");

      setOpen(false);
      if (mode === "create") {
        setName("");
        setYieldAmount("1");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={mode === "create" ? <Button /> : <Button variant="outline" size="sm" />}
      >
        {mode === "create" ? (
          <>
            <Plus /> เพิ่มสูตร
          </>
        ) : (
          <>
            <Pencil /> แก้ไข
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "เพิ่มสูตรใหม่" : `แก้ไข ${initialValues?.name}`}
          </DialogTitle>
          <DialogDescription>
            ต้นทุนคำนวณให้อัตโนมัติจาก (วัตถุดิบ × ปริมาณ) หารด้วยผลผลิต
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="rcp-name">ชื่อสูตร</Label>
            <Input
              id="rcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชาไทยเย็น"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rcp-yield">
              ผลผลิต (ทำสูตรนี้ 1 ครั้งได้กี่หน่วย เช่น กี่แก้ว/กี่ที่)
            </Label>
            <Input
              id="rcp-yield"
              type="number"
              step="0.01"
              min="0.01"
              value={yieldAmount}
              onChange={(e) => setYieldAmount(e.target.value)}
              required
            />
          </div>

          {mode === "edit" && initialValues?.id && (
            <RecipeIngredientsManager
              recipeId={initialValues.id}
              initialIngredients={initialValues.ingredients}
              availableIngredients={availableIngredients}
              onIngredientsChange={onIngredientsChange}
            />
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
