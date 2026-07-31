"use client";

import { useRef, useState, useTransition } from "react";
import { CirclePlus, Paperclip, Sparkles } from "lucide-react";
import { toast } from "@/lib/sweet-alert";
import { createExpenseEntry, extractExpenseSlipData } from "../actions/expense";
import type { CategoryRow } from "./category-manager";
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

interface ExpenseEntryDialogProps {
  categories: CategoryRow[];
  onRecorded?: () => void;
}

// FR-EXP-02: บันทึก expense entry แบบ append-only พร้อม created_by
export function ExpenseEntryDialog({ categories, onRecorded }: ExpenseEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExtracting, startExtractTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setCategoryId("");
    setAmount("");
    setDescription("");
    setSlipFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Auto-fill amount from the attached slip via free local OCR (Tesseract.js)
  // — fires as soon as a file is picked, well before the user hits "บันทึก",
  // so they see the extracted value and can correct it before saving. Never
  // overwrites a field the user already typed into.
  function handleFileChange(file: File | null) {
    setSlipFile(file);
    if (!file) return;
    startExtractTransition(async () => {
      const result = await extractExpenseSlipData(file);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.data.amount != null && !amount) {
        setAmount(String(result.data.amount));
        toast.success("อ่านจำนวนเงินจากสลิปแล้ว กรุณาตรวจสอบก่อนบันทึก");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createExpenseEntry({
        categoryId,
        amount: Number(amount),
        description,
        slipFile,
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("บันทึกค่าใช้จ่ายสำเร็จ");
      onRecorded?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <CirclePlus /> บันทึกค่าใช้จ่าย
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>บันทึกค่าใช้จ่าย</DialogTitle>
          <DialogDescription>ทุกรายการบันทึกแบบ append-only (FR-EXP-02)</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="space-y-1">
            <Label className="text-xs">หมวดหมู่</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกหมวดหมู่">
                  {(v: string) => categories.find((c) => c.id === v)?.name ?? "เลือกหมวดหมู่"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">จำนวนเงิน (บาท)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">รายละเอียด (ไม่บังคับ)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น ค่าไฟเดือนกรกฎาคม"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">สลิปโอนเงิน / ใบเสร็จ (ไม่บังคับ)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="file:text-muted-foreground file:mr-2 file:text-sm"
            />
            {slipFile && (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <Paperclip className="size-3" /> {slipFile.name} (
                {(slipFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            {isExtracting && (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <Sparkles className="size-3 animate-pulse" /> กำลังอ่านข้อมูลจากสลิป...
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              รูปภาพหรือ PDF ไม่เกิน 5MB — ระบบจะลองอ่านจำนวนเงินให้อัตโนมัติ
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={isPending || !categoryId || !amount}>
            บันทึก
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
