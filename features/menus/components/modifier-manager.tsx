"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addModifier, removeModifier } from "../actions/modifier-groups";
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

export interface ModifierRow {
  id: string;
  name: string;
  ingredientId: string | null;
  ingredientName: string | null;
  ingredientQuantity: string | null;
  ingredientCostPerUnit: string | null;
  priceDelta: string;
}

export interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
}

interface ModifierManagerProps {
  modifierGroupId: string;
  initialModifiers: ModifierRow[];
  availableIngredients: IngredientOption[];
  onModifiersChange?: (rows: ModifierRow[]) => void;
}

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };
const NO_INGREDIENT = "__none__";

// DECISIONS.md D3: modifier ผูก ingredient+quantity ได้ (กินสต็อก) หรือไม่ผูกเลย
export function ModifierManager({
  modifierGroupId,
  initialModifiers,
  availableIngredients,
  onModifiersChange,
}: ModifierManagerProps) {
  const [modifiers, setModifiers] = useState(initialModifiers);

  function updateModifiers(next: ModifierRow[]) {
    setModifiers(next);
    onModifiersChange?.(next);
  }
  const [name, setName] = useState("");
  const [ingredientId, setIngredientId] = useState(NO_INGREDIENT);
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const [priceDelta, setPriceDelta] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const boundIngredient = availableIngredients.find((i) => i.id === ingredientId);

  function handleAdd() {
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await addModifier(modifierGroupId, {
        name,
        ingredientId: ingredientId === NO_INGREDIENT ? "" : ingredientId,
        ingredientQuantity: ingredientQuantity ? Number(ingredientQuantity) : undefined,
        priceDelta: Number(priceDelta),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.modifier) {
        updateModifiers([...modifiers, result.modifier]);
      }
      setName("");
      setIngredientId(NO_INGREDIENT);
      setIngredientQuantity("");
      setPriceDelta("0");
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeModifier(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      updateModifiers(modifiers.filter((m) => m.id !== id));
    });
  }

  return (
    <div className="space-y-3">
      <Label>ตัวเลือกในกลุ่ม (Modifiers)</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {modifiers.length > 0 && (
        <ul className="space-y-1">
          {modifiers.map((m) => (
            <li
              key={m.id}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span>
                {m.name}
                {m.ingredientName && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({m.ingredientName} {m.ingredientQuantity}
                    {availableIngredients.find((i) => i.id === m.ingredientId)?.baseUnit
                      ? ` ${BASE_UNIT_LABELS[availableIngredients.find((i) => i.id === m.ingredientId)!.baseUnit]}`
                      : ""}
                    )
                  </span>
                )}
                {Number(m.priceDelta) !== 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {Number(m.priceDelta) > 0 ? "+" : ""}
                    {m.priceDelta} บาท
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(m.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="ลบตัวเลือกนี้"
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
            <Label className="text-xs">ชื่อตัวเลือก</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ไข่มุก" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ราคาเพิ่ม/ลด (บาท)</Label>
            <Input
              type="number"
              step="0.01"
              value={priceDelta}
              onChange={(e) => setPriceDelta(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">ผูกวัตถุดิบ (ไม่บังคับ)</Label>
            <Select value={ingredientId} onValueChange={(v) => setIngredientId(v ?? NO_INGREDIENT)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    v === NO_INGREDIENT
                      ? "ไม่ผูกวัตถุดิบ"
                      : (availableIngredients.find((i) => i.id === v)?.name ?? "ไม่ผูกวัตถุดิบ")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INGREDIENT}>ไม่ผูกวัตถุดิบ</SelectItem>
                {availableIngredients.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              ปริมาณ{boundIngredient ? ` (${BASE_UNIT_LABELS[boundIngredient.baseUnit]})` : ""}
            </Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={ingredientQuantity}
              onChange={(e) => setIngredientQuantity(e.target.value)}
              disabled={ingredientId === NO_INGREDIENT}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={isPending || !name}
          onClick={handleAdd}
        >
          เพิ่มตัวเลือก
        </Button>
      </div>
    </div>
  );
}
