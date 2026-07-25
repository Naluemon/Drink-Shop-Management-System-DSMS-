"use client";

import { useState, useTransition } from "react";
import { adjustExpenseEntry } from "../actions/expense";
import { formatBaht } from "@/lib/utils";
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

interface ExpenseAdjustmentDialogProps {
  entryId: string;
  categoryName: string;
  amount: string;
  onAdjusted?: () => void;
}

// FR-EXP-03: แก้ไข/ลบทำผ่านรายการปรับปรุงใหม่เท่านั้น ห้ามลบ record จริง —
// delta ติดลบเท่ากับยอดเดิมพอดี = ยกเลิกรายการทั้งหมด, ค่าอื่น = แก้ยอดบางส่วน
export function ExpenseAdjustmentDialog({
  entryId,
  categoryName,
  amount,
  onAdjusted,
}: ExpenseAdjustmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await adjustExpenseEntry({ entryId, delta: Number(delta), note });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDelta("");
      setNote("");
      setOpen(false);
      onAdjusted?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>ปรับปรุง</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ปรับปรุงรายการค่าใช้จ่าย</DialogTitle>
          <DialogDescription>
            {categoryName} — {formatBaht(Number(amount))} (รายการเดิมจะไม่ถูกลบหรือแก้ไข)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-xs">
            ใส่ -{Number(amount).toFixed(2)} เพื่อยกเลิกรายการนี้ทั้งหมด หรือใส่ค่าอื่นเพื่อแก้ยอด
          </p>
          <div className="space-y-1">
            <Label className="text-xs">จำนวนที่ปรับ (+/-)</Label>
            <Input
              type="number"
              step="0.01"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">เหตุผล (ไม่บังคับ)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น กรอกยอดผิด"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending || !delta}>
            บันทึกการปรับปรุง
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
