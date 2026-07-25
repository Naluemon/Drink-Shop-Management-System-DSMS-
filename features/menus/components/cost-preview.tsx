"use client";

import { useMemo, useState } from "react";
import { computeVariantCost, computeModifierCost, computeSaleItemCost } from "@/lib/cost-formulas";
import type { VariantRow } from "./variant-manager";
import type { ModifierRow } from "./modifier-manager";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBaht } from "@/lib/utils";

interface CostPreviewProps {
  mainRecipeCost: number;
  basePrice: number;
  variants: VariantRow[];
  modifierGroups: { id: string; name: string; modifiers: ModifierRow[] }[];
}

const BASE_VARIANT = "__base__";

// FR-MENU-06: Cost Preview แบบ real-time ต่อ combination ของ variant/modifier
// ที่เลือก — ใช้สูตรเดียวกับ lib/cost-formulas.ts (ห้าม duplicate logic ตาม
// ARCHITECTURE.md §3), คำนวณฝั่ง client ล้วนๆ ไม่ยิง request
export function CostPreview({
  mainRecipeCost,
  basePrice,
  variants,
  modifierGroups,
}: CostPreviewProps) {
  const [variantId, setVariantId] = useState(BASE_VARIANT);
  const [selectedModifierIds, setSelectedModifierIds] = useState<Set<string>>(new Set());

  const selectedVariant = variants.find((v) => v.id === variantId);

  const variantCost = useMemo(() => {
    if (!selectedVariant) return mainRecipeCost;
    return computeVariantCost(mainRecipeCost, {
      recipeMultiplier: selectedVariant.recipeMultiplier
        ? Number(selectedVariant.recipeMultiplier)
        : null,
      // Cost preview only has the variant's own recipe multiplier/price on
      // hand — for an override-recipe variant we don't have that recipe's
      // ingredient cost client-side, so this preview shows the multiplier
      // path only. (Editing the menu again after saving shows the real
      // server-computed cost per variant instead.)
      overrideRecipeCost: null,
    });
  }, [selectedVariant, mainRecipeCost]);

  const allModifiers = modifierGroups.flatMap((g) => g.modifiers);
  const selectedModifierCosts = allModifiers
    .filter((m) => selectedModifierIds.has(m.id))
    .map((m) =>
      computeModifierCost({
        ingredientQuantity: m.ingredientQuantity ? Number(m.ingredientQuantity) : null,
        ingredientCostPerUnit: m.ingredientCostPerUnit ? Number(m.ingredientCostPerUnit) : null,
      }),
    );

  const totalCost = computeSaleItemCost(variantCost, selectedModifierCosts);
  const priceDelta = Number(selectedVariant?.priceDelta ?? 0);
  const sellingPrice = basePrice + priceDelta;
  const margin = sellingPrice - totalCost;

  function toggleModifier(id: string) {
    const next = new Set(selectedModifierIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedModifierIds(next);
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
      <Label>ตัวอย่างต้นทุน (Cost Preview)</Label>

      {variants.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="cost-preview-variant" className="text-xs">
            Variant
          </Label>
          <Select value={variantId} onValueChange={(v) => setVariantId(v ?? BASE_VARIANT)}>
            <SelectTrigger id="cost-preview-variant" className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === BASE_VARIANT
                    ? "สูตรหลัก (ไม่มี variant)"
                    : variants.find((x) => x.id === v)?.name
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BASE_VARIANT}>สูตรหลัก (ไม่มี variant)</SelectItem>
              {variants.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {allModifiers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">ตัวเลือกเสริม</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {allModifiers.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={selectedModifierIds.has(m.id)}
                  onChange={() => toggleModifier(m.id)}
                  className="text-primary border-input focus:ring-ring size-3.5 rounded"
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-1 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">ต้นทุนรวม</p>
          <p className="font-medium">{formatBaht(totalCost)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">ราคาขาย</p>
          <p className="font-medium">{formatBaht(sellingPrice)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">กำไรต่อแก้ว</p>
          <p className={margin >= 0 ? "text-accent font-medium" : "text-destructive font-medium"}>
            {formatBaht(margin)}
          </p>
        </div>
      </div>
    </div>
  );
}
