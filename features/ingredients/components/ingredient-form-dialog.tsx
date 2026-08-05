"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { Plus, Pencil } from "lucide-react";
import { createIngredient, updateIngredient } from "../actions/ingredients";
import { CostCalculator } from "./cost-calculator";
import { UnitConversionsManager, type UnitConversionRow } from "./unit-conversions-manager";
import { UnitConversionsEditor, type PendingUnitConversion } from "./unit-conversions-editor";
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
  shelfLifeDaysAfterOpening: string;
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
  shelfLifeDaysAfterOpening: string;
  supplierId: string;
  // Only set on create (see createIngredient's finalIngredient re-fetch) —
  // edit never touches stock/unit conversions, so the list falls back to
  // whatever the row already had.
  currentStockQty?: string;
  unitConversions?: UnitConversionRow[];
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
  const [shelfLifeDaysAfterOpening, setShelfLifeDaysAfterOpening] = useState(
    initialValues?.shelfLifeDaysAfterOpening ?? "",
  );
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId ?? "");
  const [startingStock, setStartingStock] = useState("");
  const [pendingUnitConversions, setPendingUnitConversions] = useState<PendingUnitConversion[]>([]);
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
        shelfLifeDaysAfterOpening:
          shelfLifeDaysAfterOpening === "" ? ("" as const) : Number(shelfLifeDaysAfterOpening),
        supplierId,
        startingStock: startingStock === "" ? ("" as const) : Number(startingStock),
        unitConversions:
          mode === "create"
            ? pendingUnitConversions.map((r) => ({
                purchaseUnitName: r.purchaseUnitName,
                conversionFactor: Number(r.conversionFactor),
              }))
            : undefined,
      };
      let id: string;
      let currentStockQty: string | undefined;
      let unitConversions: UnitConversionRow[] | undefined;
      let stockInError: string | undefined;
      let unitConversionErrors: string[] | undefined;
      if (mode === "create") {
        const result = await createIngredient(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.ingredient!.id;
        currentStockQty = result.ingredient!.currentStockQty.toString();
        unitConversions = result.ingredient!.unitConversions.map((c) => ({
          id: c.id,
          purchaseUnitName: c.purchaseUnitName,
          conversionFactor: c.conversionFactor.toString(),
        }));
        stockInError = result.stockInError;
        unitConversionErrors = result.unitConversionErrors;
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
        shelfLifeDaysAfterOpening,
        supplierId,
        currentStockQty,
        unitConversions,
      });

      const partialErrors = [stockInError, ...(unitConversionErrors ?? [])].filter(
        (m): m is string => Boolean(m),
      );
      if (partialErrors.length > 0) {
        // Ingredient itself was created (onSaved already fired so the list
        // reflects it) — only stock-in and/or unit-conversion rows failed.
        // Keep the dialog open so this doesn't get missed, matching the
        // file-import dialog's treatment of the same failure mode.
        setError(`เพิ่มวัตถุดิบสำเร็จ แต่มีปัญหา: ${partialErrors.join("; ")}`);
        return;
      }

      toast.success(mode === "create" ? "เพิ่มวัตถุดิบสำเร็จ" : "แก้ไขวัตถุดิบสำเร็จ");

      // Close back to the list on success either way — only create resets the
      // fields, since an edit dialog closing has no reason to blank them out.
      setOpen(false);
      if (mode === "create") {
        setName("");
        setBaseUnit("gram");
        setCostPerUnit("0");
        setLowStockThreshold("");
        setShelfLifeDaysAfterOpening("");
        setSupplierId("");
        setStartingStock("");
        setPendingUnitConversions([]);
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
            หน่วยฐานเลือกได้ครั้งเดียวตอนสร้าง และจะใช้แบบนี้ตลอดเมื่อนำวัตถุดิบนี้ไปทำสูตร
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

          <div className="space-y-2">
            <Label htmlFor="ing-shelf-life">อายุการใช้งานหลังเปิด (วัน)</Label>
            <Input
              id="ing-shelf-life"
              type="number"
              step="1"
              min="1"
              value={shelfLifeDaysAfterOpening}
              onChange={(e) => setShelfLifeDaysAfterOpening(e.target.value)}
              placeholder="ไม่บังคับ — ใส่เฉพาะของที่เปิดแล้วเสื่อมสภาพ เช่น ผงชง 7 วัน"
            />
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="ing-starting-stock">สต็อกเริ่มต้น (ไม่บังคับ)</Label>
              <Input
                id="ing-starting-stock"
                type="number"
                step="0.01"
                min="0"
                value={startingStock}
                onChange={(e) => setStartingStock(e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ing-supplier">ผู้จำหน่าย (ไม่บังคับ)</Label>
            <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? "")}>
              <SelectTrigger id="ing-supplier" className="w-full">
                <SelectValue placeholder="ไม่ระบุ">
                  {(v: string) => suppliers.find((s) => s.id === v)?.name ?? "ไม่ระบุ"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">ไม่ระบุ</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 && (
              <p className="text-muted-foreground text-xs">
                ยังไม่มีผู้จำหน่ายในระบบ — เพิ่มได้ที่หน้า &quot;ผู้จำหน่าย&quot;
              </p>
            )}
          </div>

          <CostCalculator baseUnit={baseUnit} onApply={(v) => setCostPerUnit(v.toFixed(4))} />

          <div className="space-y-2">
            <Label htmlFor="ing-cost">ต้นทุนต่อหน่วย (บาท) — กรอกเองได้ก่อนมีใบสั่งซื้อจริง</Label>
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

          {mode === "edit" && initialValues?.id ? (
            <UnitConversionsManager
              ingredientId={initialValues.id}
              baseUnit={baseUnit}
              initialConversions={initialValues.unitConversions}
            />
          ) : (
            <UnitConversionsEditor
              baseUnit={baseUnit}
              rows={pendingUnitConversions}
              onChange={setPendingUnitConversions}
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
