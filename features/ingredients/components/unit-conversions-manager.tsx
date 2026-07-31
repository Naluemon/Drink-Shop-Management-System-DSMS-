"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addUnitConversion, deleteUnitConversion } from "../actions/ingredients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface UnitConversionRow {
  id: string;
  purchaseUnitName: string;
  conversionFactor: string;
}

interface UnitConversionsManagerProps {
  ingredientId: string;
  baseUnit: string;
  initialConversions: UnitConversionRow[];
}

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

// FR-ING-03: purchase_unit + conversion_factor หลายรายการต่อ ingredient
export function UnitConversionsManager({
  ingredientId,
  baseUnit,
  initialConversions,
}: UnitConversionsManagerProps) {
  const [conversions, setConversions] = useState(initialConversions);
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name || !factor) return;
    setError(null);
    startTransition(async () => {
      const result = await addUnitConversion(ingredientId, {
        purchaseUnitName: name,
        conversionFactor: Number(factor),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.conversion) {
        setConversions((prev) => [
          ...prev,
          {
            id: result.conversion.id,
            purchaseUnitName: result.conversion.purchaseUnitName,
            conversionFactor: result.conversion.conversionFactor.toString(),
          },
        ]);
        toast.success("เพิ่มหน่วยซื้อสำเร็จ");
      }
      setName("");
      setFactor("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteUnitConversion(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setConversions((prev) => prev.filter((c) => c.id !== id));
      toast.success("ลบหน่วยซื้อสำเร็จ");
    });
  }

  return (
    <div className="space-y-3">
      <Label>หน่วยซื้อ (Purchase Unit)</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {conversions.length > 0 && (
        <ul className="space-y-1">
          {conversions.map((c) => (
            <li
              key={c.id}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span>
                1 {c.purchaseUnitName} = {c.conversionFactor}{" "}
                {BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="ลบหน่วยซื้อนี้"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* div, not <form> — this lives inside the ingredient's own <form>, and
          nested forms are invalid HTML (breaks submit/hydration) */}
      <div
        className="flex items-end gap-2"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="unitconv-name" className="text-xs">
            ชื่อหน่วยซื้อ
          </Label>
          <Input
            id="unitconv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="กล่อง 946ml"
          />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="unitconv-factor" className="text-xs">
            = กี่{BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
          </Label>
          <Input
            id="unitconv-factor"
            type="number"
            step="0.0001"
            min="0"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isPending || !name || !factor}
          onClick={handleAdd}
        >
          เพิ่ม
        </Button>
      </div>
    </div>
  );
}
