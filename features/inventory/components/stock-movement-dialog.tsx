"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
          {(v: string) => ingredients.find((i) => i.id === v)?.name ?? "เลือกวัตถุดิบ"}
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

function StockInForm({
  ingredients,
  onDone,
}: {
  ingredients: IngredientOption[];
  onDone: () => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordStockIn({ ingredientId, quantity: Number(quantity), note });
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
          onChange={setIngredientId}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">จำนวนที่รับเข้า</Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
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
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deficitWarning, setDeficitWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordStockOut({
        ingredientId,
        quantity: Number(quantity),
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
          onChange={setIngredientId}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">จำนวนที่จ่ายออก</Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
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
        <Label className="text-xs">จำนวนที่ปรับ (+/-)</Label>
        <Input
          type="number"
          step="0.0001"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
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
