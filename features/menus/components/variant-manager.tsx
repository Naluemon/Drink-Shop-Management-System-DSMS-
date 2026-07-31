"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { Trash2 } from "lucide-react";
import { addMenuVariant, removeMenuVariant } from "../actions/menus";
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
import { Badge } from "@/components/ui/badge";

export interface VariantRow {
  id: string;
  name: string;
  recipeMultiplier: string | null;
  overrideRecipeId: string | null;
  priceDelta: string;
  isDefault: boolean;
}

export interface RecipeOption {
  id: string;
  name: string;
}

interface VariantManagerProps {
  menuId: string;
  initialVariants: VariantRow[];
  availableRecipes: RecipeOption[];
  onVariantsChange?: (rows: VariantRow[]) => void;
}

// DECISIONS.md D3 / FR-MENU-03: variant ใช้ recipe_multiplier (default) หรือ
// override_recipe_id — เลือกได้ทางใดทางหนึ่งเท่านั้น
export function VariantManager({
  menuId,
  initialVariants,
  availableRecipes,
  onVariantsChange,
}: VariantManagerProps) {
  const [variants, setVariants] = useState(initialVariants);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"multiplier" | "override">("multiplier");
  const [multiplier, setMultiplier] = useState("1");
  const [overrideRecipeId, setOverrideRecipeId] = useState("");
  const [priceDelta, setPriceDelta] = useState("0");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateVariants(next: VariantRow[]) {
    setVariants(next);
    onVariantsChange?.(next);
  }

  function handleAdd() {
    if (!name) return;
    if (mode === "override" && !overrideRecipeId) return;
    setError(null);
    startTransition(async () => {
      const result = await addMenuVariant(menuId, {
        name,
        mode,
        recipeMultiplier: mode === "multiplier" ? Number(multiplier) : undefined,
        overrideRecipeId: mode === "override" ? overrideRecipeId : undefined,
        priceDelta: Number(priceDelta),
        isDefault,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.variant) {
        const next = isDefault
          ? [...variants.map((v) => ({ ...v, isDefault: false })), result.variant]
          : [...variants, result.variant];
        updateVariants(next);
        toast.success("เพิ่มตัวเลือกขนาดสำเร็จ");
      }
      setName("");
      setMultiplier("1");
      setOverrideRecipeId("");
      setPriceDelta("0");
      setIsDefault(false);
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeMenuVariant(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      updateVariants(variants.filter((v) => v.id !== id));
      toast.success("ลบตัวเลือกขนาดสำเร็จ");
    });
  }

  return (
    <div className="space-y-3">
      <Label>ตัวเลือกขนาด (Variants)</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {variants.length > 0 && (
        <ul className="space-y-1">
          {variants.map((v) => (
            <li
              key={v.id}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-1.5">
                {v.name}
                <span className="text-muted-foreground">
                  {v.overrideRecipeId
                    ? `(สูตรทดแทน) ${Number(v.priceDelta) >= 0 ? "+" : ""}${v.priceDelta} บาท`
                    : `(×${v.recipeMultiplier}) ${Number(v.priceDelta) >= 0 ? "+" : ""}${v.priceDelta} บาท`}
                </span>
                {v.isDefault && <Badge variant="secondary">ค่าเริ่มต้น</Badge>}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(v.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="ลบตัวเลือกขนาดนี้"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="variant-name" className="text-xs">
              ชื่อ variant
            </Label>
            <Input
              id="variant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Size L"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="variant-price-delta" className="text-xs">
              ส่วนต่างราคา (บาท)
            </Label>
            <Input
              id="variant-price-delta"
              type="number"
              step="0.01"
              value={priceDelta}
              onChange={(e) => setPriceDelta(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="variant-mode" className="text-xs">
            วิธีคำนวณต้นทุน
          </Label>
          <Select value={mode} onValueChange={(v) => setMode((v ?? "multiplier") as typeof mode)}>
            <SelectTrigger id="variant-mode" className="w-full">
              <SelectValue>
                {(v: string) => (v === "override" ? "ใช้สูตรทดแทนทั้งหมด" : "คูณสูตรหลัก")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multiplier">คูณสูตรหลัก (เช่น ×0.8)</SelectItem>
              <SelectItem value="override">ใช้สูตรทดแทนทั้งหมด</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "multiplier" ? (
          <div className="space-y-1">
            <Label htmlFor="variant-multiplier" className="text-xs">
              ตัวคูณสูตรหลัก
            </Label>
            <Input
              id="variant-multiplier"
              type="number"
              step="0.01"
              min="0.01"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="variant-override-recipe" className="text-xs">
              สูตรทดแทน
            </Label>
            <Select value={overrideRecipeId} onValueChange={(v) => setOverrideRecipeId(v ?? "")}>
              <SelectTrigger id="variant-override-recipe" className="w-full">
                <SelectValue placeholder="เลือกสูตร">
                  {(v: string) => availableRecipes.find((r) => r.id === v)?.name ?? "เลือกสูตร"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRecipes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="text-primary border-input focus:ring-ring size-4 rounded"
          />
          ตั้งเป็นค่าเริ่มต้น
        </label>

        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={isPending || !name || (mode === "override" && !overrideRecipeId)}
          onClick={handleAdd}
        >
          เพิ่ม variant
        </Button>
      </div>
    </div>
  );
}
