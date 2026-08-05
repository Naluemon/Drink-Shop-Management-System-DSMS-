"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PendingUnitConversion {
  purchaseUnitName: string;
  conversionFactor: string;
}

interface UnitConversionsEditorProps {
  baseUnit: string;
  rows: PendingUnitConversion[];
  onChange: (rows: PendingUnitConversion[]) => void;
}

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

// Create-mode counterpart to UnitConversionsManager: the ingredient doesn't
// have an id yet (UnitConversion.ingredientId is a required FK), so rows are
// held here in memory and only sent to the server once the ingredient itself
// is created (see createIngredient's unitConversions payload) — same
// deferred pattern this form already uses for startingStock.
export function UnitConversionsEditor({ baseUnit, rows, onChange }: UnitConversionsEditorProps) {
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");

  function handleAdd() {
    if (!name || !factor) return;
    onChange([...rows, { purchaseUnitName: name, conversionFactor: factor }]);
    setName("");
    setFactor("");
  }

  function handleDelete(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>หน่วยซื้อ (Purchase Unit)</Label>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r, index) => (
            <li
              key={index}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span>
                1 {r.purchaseUnitName} = {r.conversionFactor}{" "}
                {BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(index)}
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
          <Label htmlFor="unitconv-new-name" className="text-xs">
            ชื่อหน่วยซื้อ
          </Label>
          <Input
            id="unitconv-new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="กล่อง 946ml"
          />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="unitconv-new-factor" className="text-xs">
            = กี่{BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
          </Label>
          <Input
            id="unitconv-new-factor"
            type="number"
            step="0.0001"
            min="0"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" disabled={!name || !factor} onClick={handleAdd}>
          เพิ่ม
        </Button>
      </div>
    </div>
  );
}
