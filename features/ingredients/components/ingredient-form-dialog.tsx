"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil } from "lucide-react";
import { createIngredient, updateIngredient } from "../actions/ingredients";
import { CostCalculator } from "./cost-calculator";
import { UnitConversionsManager, type UnitConversionRow } from "./unit-conversions-manager";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE_UNIT_OPTIONS = [
  { value: "gram", label: "กรัม (gram)" },
  { value: "ml", label: "มิลลิลิตร (ml)" },
  { value: "piece", label: "ชิ้น (piece)" },
];

export interface IngredientFormValues {
  id?: string;
  name: string;
  baseUnit: string;
  costPerUnit: string;
  lowStockThreshold: string;
  supplierId: string;
  unitConversions: UnitConversionRow[];
}

interface SupplierOption {
  id: string;
  name: string;
}

export interface SavedIngredientFields {
  id: string;
  name: string;
  baseUnit: string;
  costPerUnit: string;
  lowStockThreshold: string;
  supplierId: string;
}

interface IngredientFormDialogProps {
  mode: "create" | "edit";
  initialValues?: IngredientFormValues;
  suppliers: SupplierOption[];
  onSaved?: (fields: SavedIngredientFields) => void;
}

export function IngredientFormDialog({
  mode,
  initialValues,
  suppliers,
  onSaved,
}: IngredientFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [baseUnit, setBaseUnit] = useState(initialValues?.baseUnit ?? "gram");
  const [costPerUnit, setCostPerUnit] = useState(initialValues?.costPerUnit ?? "0");
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initialValues?.lowStockThreshold ?? "",
  );
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        name,
        baseUnit: baseUnit as never,
        costPerUnit: Number(costPerUnit),
        lowStockThreshold: lowStockThreshold === "" ? ("" as const) : Number(lowStockThreshold),
        supplierId,
      };
      let id: string;
      if (mode === "create") {
        const result = await createIngredient(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.ingredient!.id;
      } else {
        const result = await updateIngredient(initialValues!.id!, input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = initialValues!.id!;
      }

      onSaved?.({
        id,
        name,
        baseUnit,
        costPerUnit,
        lowStockThreshold,
        supplierId,
      });

      if (mode === "create") {
        setOpen(false);
        setName("");
        setBaseUnit("gram");
        setCostPerUnit("0");
        setLowStockThreshold("");
        setSupplierId("");
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
            <Plus /> เพิ่มวัตถุดิบ
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
            {mode === "create" ? "เพิ่มวัตถุดิบใหม่" : `แก้ไข ${initialValues?.name}`}
          </DialogTitle>
          <DialogDescription>
            หน่วยฐาน (base unit) กำหนดครั้งเดียว ใช้ในสูตรเสมอ (DECISIONS.md D2)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="ing-name">ชื่อวัตถุดิบ</Label>
            <Input
              id="ing-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ผงชาไทย"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ing-unit">หน่วยฐาน</Label>
              <Select value={baseUnit} onValueChange={(v) => setBaseUnit(v ?? "gram")}>
                <SelectTrigger id="ing-unit" className="w-full">
                  <SelectValue>
                    {(v: string) => BASE_UNIT_OPTIONS.find((opt) => opt.value === v)?.label ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BASE_UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ing-threshold">แจ้งเตือนสต็อกต่ำที่</Label>
              <Input
                id="ing-threshold"
                type="number"
                step="0.01"
                min="0"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                placeholder="ไม่บังคับ"
              />
            </div>
          </div>

          {suppliers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="ing-supplier">ผู้จำหน่าย (ไม่บังคับ)</Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? "")}>
                <SelectTrigger id="ing-supplier" className="w-full">
                  <SelectValue placeholder="ไม่ระบุ">
                    {(v: string) => suppliers.find((s) => s.id === v)?.name ?? "ไม่ระบุ"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <CostCalculator baseUnit={baseUnit} onApply={(v) => setCostPerUnit(v.toFixed(4))} />

          <div className="space-y-2">
            <Label htmlFor="ing-cost">ต้นทุนต่อหน่วย (บาท) — ค่ากรอกมือก่อนมี PO จริง (D1)</Label>
            <Input
              id="ing-cost"
              type="number"
              step="0.0001"
              min="0"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
              required
            />
          </div>

          {mode === "edit" && initialValues?.id && (
            <UnitConversionsManager
              ingredientId={initialValues.id}
              baseUnit={baseUnit}
              initialConversions={initialValues.unitConversions}
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
