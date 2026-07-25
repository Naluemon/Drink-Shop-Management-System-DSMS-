"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

interface CostCalculatorProps {
  baseUnit: string;
  onApply: (costPerUnit: number) => void;
}

// FR-ING-04 / Phase 3 AC: "ระบบคำนวณ Price/Gram อัตโนมัติจาก purchase price ÷
// conversion factor" — unit_conversions has no price column (that only exists
// once Purchase Orders arrive in Phase 7), so this is a client-side helper:
// type a purchase price + conversion factor, get the per-base-unit cost, and
// copy it into cost_per_unit (the FR-ING-05 manual bootstrap value).
export function CostCalculator({ baseUnit, onApply }: CostCalculatorProps) {
  const [price, setPrice] = useState("");
  const [factor, setFactor] = useState("");

  const priceNum = Number(price);
  const factorNum = Number(factor);
  const computed = price && factor && factorNum > 0 ? priceNum / factorNum : null;

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">
        ตัวช่วยคำนวณ: กรอกราคาซื้อและอัตราแปลงหน่วย เพื่อคำนวณต้นทุนต่อ{" "}
        {BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">ราคาซื้อ (บาท)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="95.00"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            1 หน่วยซื้อ = กี่{BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
          </Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            placeholder="200"
          />
        </div>
      </div>
      {computed !== null && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            = <strong>{formatNumber(computed, 4)}</strong> บาท/
            {BASE_UNIT_LABELS[baseUnit] ?? baseUnit}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => onApply(computed)}>
            ใช้เป็นต้นทุนต่อหน่วย
          </Button>
        </div>
      )}
    </div>
  );
}
