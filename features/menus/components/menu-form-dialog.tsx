"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil } from "lucide-react";
import { createMenu, updateMenu } from "../actions/menus";
import { VariantManager, type VariantRow, type RecipeOption } from "./variant-manager";
import { ModifierGroupsAttacher, type ModifierGroupOption } from "./modifier-groups-attacher";
import { CostPreview } from "./cost-preview";
import type { ModifierRow } from "./modifier-manager";
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
import { formatBaht } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MenuFormValues {
  id?: string;
  name: string;
  recipeId: string;
  recipeCost: number;
  categoryId: string;
  basePrice: string;
  imageUrl: string;
  isAvailable: boolean;
  variants: VariantRow[];
  modifierGroupIds: string[];
}

export interface SavedMenuFields {
  id: string;
  name: string;
  recipeId: string;
  recipeName: string;
  categoryId: string;
  categoryName: string | null;
  basePrice: string;
  imageUrl: string;
  isAvailable: boolean;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface MenuFormDialogProps {
  mode: "create" | "edit";
  initialValues?: MenuFormValues;
  availableRecipes: (RecipeOption & { cost: number })[];
  availableCategories: CategoryOption[];
  availableModifierGroups: (ModifierGroupOption & { modifiers: ModifierRow[] })[];
  onSaved?: (fields: SavedMenuFields) => void;
}

const NO_CATEGORY = "__none__";

// FR-MENU-01/02: CRUD menu ผูก recipe หลัก 1 ตัว
export function MenuFormDialog({
  mode,
  initialValues,
  availableRecipes,
  availableCategories,
  availableModifierGroups,
  onSaved,
}: MenuFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [recipeId, setRecipeId] = useState(initialValues?.recipeId ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId || NO_CATEGORY);
  const [basePrice, setBasePrice] = useState(initialValues?.basePrice ?? "0");
  const [imageUrl, setImageUrl] = useState(initialValues?.imageUrl ?? "");
  const [isAvailable, setIsAvailable] = useState(initialValues?.isAvailable ?? true);
  const [variants, setVariants] = useState(initialValues?.variants ?? []);
  const [modifierGroupIds, setModifierGroupIds] = useState(initialValues?.modifierGroupIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedRecipe = availableRecipes.find((r) => r.id === recipeId);
  const selectedModifierGroups = availableModifierGroups.filter((g) =>
    modifierGroupIds.includes(g.id),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        name,
        recipeId,
        categoryId: categoryId === NO_CATEGORY ? "" : categoryId,
        basePrice: Number(basePrice),
        imageUrl,
        isAvailable,
      };

      let id: string;
      if (mode === "create") {
        const result = await createMenu(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.menu!.id;
      } else {
        const result = await updateMenu(initialValues!.id!, input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = initialValues!.id!;
      }

      const category = availableCategories.find((c) => c.id === categoryId);
      onSaved?.({
        id,
        name,
        recipeId,
        recipeName: selectedRecipe?.name ?? "",
        categoryId: categoryId === NO_CATEGORY ? "" : categoryId,
        categoryName: category?.name ?? null,
        basePrice,
        imageUrl,
        isAvailable,
      });

      if (mode === "create") {
        setOpen(false);
        setName("");
        setRecipeId("");
        setCategoryId(NO_CATEGORY);
        setBasePrice("0");
        setImageUrl("");
        setIsAvailable(true);
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
            <Plus /> เพิ่มเมนู
          </>
        ) : (
          <>
            <Pencil /> แก้ไข
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "เพิ่มเมนูใหม่" : `แก้ไข ${initialValues?.name}`}
          </DialogTitle>
          <DialogDescription>ผูกกับสูตร 1 ตัวเสมอ (FR-MENU-02)</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="menu-name">ชื่อเมนู</Label>
            <Input
              id="menu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชาไทยเย็น"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="menu-recipe">สูตรหลัก</Label>
            <Select value={recipeId} onValueChange={(v) => setRecipeId(v ?? "")}>
              <SelectTrigger id="menu-recipe" className="w-full">
                <SelectValue placeholder="เลือกสูตร">
                  {(v: string) => availableRecipes.find((r) => r.id === v)?.name ?? "เลือกสูตร"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRecipes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({formatBaht(r.cost)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="menu-category">หมวดหมู่ (ไม่บังคับ)</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? NO_CATEGORY)}>
                <SelectTrigger id="menu-category" className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      v === NO_CATEGORY
                        ? "ไม่ระบุ"
                        : (availableCategories.find((c) => c.id === v)?.name ?? "ไม่ระบุ")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>ไม่ระบุ</SelectItem>
                  {availableCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-price">ราคาตั้งต้น (บาท)</Label>
              <Input
                id="menu-price"
                type="number"
                step="0.01"
                min="0"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="menu-image">URL รูปภาพ (ไม่บังคับ)</Label>
            <Input
              id="menu-image"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="text-primary border-input focus:ring-ring size-4 rounded"
            />
            พร้อมขาย
          </label>

          {mode === "edit" && initialValues?.id && (
            <>
              <VariantManager
                menuId={initialValues.id}
                initialVariants={variants}
                availableRecipes={availableRecipes}
                onVariantsChange={setVariants}
              />

              <ModifierGroupsAttacher
                menuId={initialValues.id}
                availableGroups={availableModifierGroups}
                initialSelectedIds={initialValues.modifierGroupIds}
                onChange={setModifierGroupIds}
              />

              {selectedRecipe && (
                <CostPreview
                  mainRecipeCost={selectedRecipe.cost}
                  basePrice={Number(basePrice)}
                  variants={variants}
                  modifierGroups={selectedModifierGroups}
                />
              )}
            </>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
