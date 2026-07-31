"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { PackagePlus } from "lucide-react";
import { recordStockIn, recordStockOut, recordAdjustment } from "../actions/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  unitConversions: { id: string; purchaseUnitName: string; conversionFactor: string }[];
}

export interface ReasonCodeOption {
  code: string;
  label: string;
}

interface StockMovementDialogProps {
  ingredients: IngredientOption[];
  reasonCodes: ReasonCodeOption[];
  canAdjust: boolean;
  onRecorded?: () => void;
}

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

interface UnitOption {
  // "" = the ingredient's own base unit (factor 1); anything else is a
  // UnitConversion id from features/ingredients (e.g. "1 ถุง = 1000 กรัม").
  key: string;
  // Short unit name for the quantity field's label/placeholder ("กรัม", "ถุง").
  shortLabel: string;
  // Full "1 X = Y กรัม" explanation, shown only in the unit dropdown itself —
  // that's the one place someone needs to double-check the conversion rate.
  dropdownLabel: string;
  factor: number;
}

// Recording stock in grams/ml only makes sense to someone who already knows
// the conversion by heart — a delivery is counted in ถุง/แพ็ก/ขวด, not grams.
// Reuses the same unit-conversion rates already configured per ingredient
// (features/ingredients/components/unit-conversions-manager.tsx) so a
// cashier can enter "3 ถุง" and the base-unit math happens automatically.
function buildUnitOptions(ingredient: IngredientOption | undefined): UnitOption[] {
  if (!ingredient) return [];
  const baseLabel = BASE_UNIT_LABELS[ingredient.baseUnit] ?? ingredient.baseUnit;
  return [
    { key: "", shortLabel: baseLabel, dropdownLabel: baseLabel, factor: 1 },
    ...ingredient.unitConversions.map((c) => ({
      key: c.id,
      shortLabel: c.purchaseUnitName,
      dropdownLabel: `${c.purchaseUnitName} (1 ${c.purchaseUnitName} = ${c.conversionFactor} ${baseLabel})`,
      factor: Number(c.conversionFactor),
    })),
  ];
}

// FR-INV-01/02/03: Stock In / Stock Out (reason code บังคับ) / Adjustment
// (จำกัด Manager/Owner) — แยกเป็น 3 แท็บ เพราะ permission และฟิลด์ต่างกัน
export function StockMovementDialog({
  ingredients,
  reasonCodes,
  canAdjust,
  onRecorded,
}: StockMovementDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PackagePlus /> บันทึกการเคลื่อนไหวสต็อก
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>บันทึกการเคลื่อนไหวสต็อก</DialogTitle>
          <DialogDescription>ทุกรายการบันทึกแบบ append-only (FR-INV-05)</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="in">
          <TabsList className="w-full">
            <TabsTrigger value="in" className="flex-1">
              รับเข้า
            </TabsTrigger>
            <TabsTrigger value="out" className="flex-1">
              จ่ายออก
            </TabsTrigger>
            {canAdjust && (
              <TabsTrigger value="adjust" className="flex-1">
                ปรับปรุง
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="in">
            <StockInForm
              ingredients={ingredients}
              onDone={() => {
                onRecorded?.();
                setOpen(false);
              }}
            />
          </TabsContent>
          <TabsContent value="out">
            <StockOutForm
              ingredients={ingredients}
              reasonCodes={reasonCodes}
              onDone={() => {
                onRecorded?.();
                setOpen(false);
              }}
            />
          </TabsContent>
          {canAdjust && (
            <TabsContent value="adjust">
              <AdjustmentForm
                ingredients={ingredients}
                onDone={() => {
                  onRecorded?.();
                  setOpen(false);
                }}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function IngredientSelect({
  ingredients,
  value,
  onChange,
}: {
  ingredients: IngredientOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="เลือกวัตถุดิบ">
          {(v: string) => {
            const selected = ingredients.find((i) => i.id === v);
            if (!selected) return "เลือกวัตถุดิบ";
            // Keep the unit visible on the collapsed trigger too, not just in
            // the dropdown options — otherwise it's out of view by the time
            // the user is typing the quantity below.
            return `${selected.name} (${BASE_UNIT_LABELS[selected.baseUnit] ?? selected.baseUnit})`;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ingredients.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name} ({BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UnitSelect({
  options,
  value,
  onChange,
}: {
  options: UnitOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="w-full">
        <SelectValue>
          {(v: string) =>
            options.find((u) => u.key === v)?.dropdownLabel ?? options[0]?.dropdownLabel
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u.key || "base"} value={u.key}>
            {u.dropdownLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StockInForm({
  ingredients,
  onDone,
}: {
  ingredients: IngredientOption[];
  onDone: () => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [unitKey, setUnitKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);
  const unitOptions = buildUnitOptions(selectedIngredient);
  const selectedUnit = unitOptions.find((u) => u.key === unitKey) ?? unitOptions[0];

  function handleIngredientChange(id: string) {
    setIngredientId(id);
    setUnitKey("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const baseQuantity = Number(quantity) * (selectedUnit?.factor ?? 1);
      const result = await recordStockIn({ ingredientId, quantity: baseQuantity, note });
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("บันทึกรับเข้าสำเร็จ");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="space-y-1">
        <Label className="text-xs">วัตถุดิบ</Label>
        <IngredientSelect
          ingredients={ingredients}
          value={ingredientId}
          onChange={handleIngredientChange}
        />
      </div>
      {unitOptions.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">นับเป็นหน่วย</Label>
          <UnitSelect options={unitOptions} value={unitKey} onChange={setUnitKey} />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">
          จำนวนที่รับเข้า{selectedUnit && ` (${selectedUnit.shortLabel})`}
        </Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={selectedUnit ? `จำนวน${selectedUnit.shortLabel}` : undefined}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">หมายเหตุ (ไม่บังคับ)</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น เลขที่ใบส่งของ"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending || !ingredientId || !quantity}>
        บันทึกรับเข้า
      </Button>
    </form>
  );
}

function StockOutForm({
  ingredients,
  reasonCodes,
  onDone,
}: {
  ingredients: IngredientOption[];
  reasonCodes: ReasonCodeOption[];
  onDone: () => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [unitKey, setUnitKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deficitWarning, setDeficitWarning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);
  const unitOptions = buildUnitOptions(selectedIngredient);
  const selectedUnit = unitOptions.find((u) => u.key === unitKey) ?? unitOptions[0];

  function handleIngredientChange(id: string) {
    setIngredientId(id);
    setUnitKey("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const baseQuantity = Number(quantity) * (selectedUnit?.factor ?? 1);
      const result = await recordStockOut({
        ingredientId,
        quantity: baseQuantity,
        reasonCode,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.isStockDeficit) {
        setDeficitWarning(true);
        return;
      }
      toast.success("บันทึกจ่ายออกสำเร็จ");
      onDone();
    });
  }

  if (deficitWarning) {
    return (
      <div className="space-y-3 pt-2">
        <div className="border-secondary bg-secondary/50 text-secondary-foreground rounded-lg border p-3 text-sm">
          บันทึกสำเร็จ — แต่สต็อกไม่พอ ระบบตัดสต็อกติดลบชั่วคราวและบันทึกไว้เป็น{" "}
          <strong>รายการที่สต็อกพร่อง</strong> ให้ผู้จัดการตรวจสอบ (DECISIONS.md D4)
        </div>
        <Button type="button" className="w-full" onClick={onDone}>
          ตกลง
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="space-y-1">
        <Label className="text-xs">วัตถุดิบ</Label>
        <IngredientSelect
          ingredients={ingredients}
          value={ingredientId}
          onChange={handleIngredientChange}
        />
      </div>
      {unitOptions.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">นับเป็นหน่วย</Label>
          <UnitSelect options={unitOptions} value={unitKey} onChange={setUnitKey} />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">
          จำนวนที่จ่ายออก{selectedUnit && ` (${selectedUnit.shortLabel})`}
        </Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={selectedUnit ? `จำนวน${selectedUnit.shortLabel}` : undefined}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">เหตุผล (บังคับ)</Label>
        <Select value={reasonCode} onValueChange={(v) => setReasonCode(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="เลือกเหตุผล">
              {(v: string) => reasonCodes.find((r) => r.code === v)?.label ?? "เลือกเหตุผล"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {reasonCodes.map((r) => (
              <SelectItem key={r.code} value={r.code}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !ingredientId || !quantity || !reasonCode}
      >
        บันทึกจ่ายออก
      </Button>
    </form>
  );
}

function AdjustmentForm({
  ingredients,
  onDone,
}: {
  ingredients: IngredientOption[];
  onDone: () => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedUnit = ingredients.find((i) => i.id === ingredientId)?.baseUnit;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordAdjustment({ ingredientId, delta: Number(delta), note });
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("บันทึกปรับปรุงสำเร็จ");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <p className="text-muted-foreground text-xs">
        ใช้ตัวเลขบวก/ลบเพื่อปรับสต็อกให้ตรงกับที่นับได้จริง (เช่น -5 ถ้านับได้น้อยกว่าระบบ 5 หน่วย)
      </p>
      <div className="space-y-1">
        <Label className="text-xs">วัตถุดิบ</Label>
        <IngredientSelect
          ingredients={ingredients}
          value={ingredientId}
          onChange={setIngredientId}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          จำนวนที่ปรับ (+/-)
          {selectedUnit && ` (${BASE_UNIT_LABELS[selectedUnit] ?? selectedUnit})`}
        </Label>
        <Input
          type="number"
          step="0.0001"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder={
            selectedUnit ? `จำนวน${BASE_UNIT_LABELS[selectedUnit] ?? selectedUnit}` : undefined
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">หมายเหตุ (ไม่บังคับ)</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น นับสต็อกประจำเดือน"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending || !ingredientId || !delta}>
        บันทึกปรับปรุง
      </Button>
    </form>
  );
}
