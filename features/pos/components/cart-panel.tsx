"use client";

import { Trash2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBaht } from "@/lib/utils";

export interface CartLine {
  key: string;
  menuId: string;
  menuName: string;
  variantId: string | null;
  variantName: string | null;
  modifierIds: string[];
  modifierNames: string[];
  quantity: number;
  unitPrice: number;
  lineDiscountAmount: number;
}

interface CartPanelProps {
  cart: CartLine[];
  billDiscountAmount: number;
  paymentMethod: "cash" | "qr";
  isCheckingOut: boolean;
  error: string | null;
  onUpdateQuantity: (key: string, quantity: number) => void;
  onUpdateLineDiscount: (key: string, amount: number) => void;
  onRemoveLine: (key: string) => void;
  onBillDiscountChange: (amount: number) => void;
  onPaymentMethodChange: (method: "cash" | "qr") => void;
  onCheckout: () => void;
}

// FR-POS-03/06: ส่วนลดระดับรายการ+บิล, เลือกวิธีชำระเงิน — ยอดที่แสดงตรงนี้
// เป็น "ตัวอย่าง" เท่านั้น ยอดจริงคำนวณใหม่ฝั่ง server ใน checkout()
export function CartPanel({
  cart,
  billDiscountAmount,
  paymentMethod,
  isCheckingOut,
  error,
  onUpdateQuantity,
  onUpdateLineDiscount,
  onRemoveLine,
  onBillDiscountChange,
  onPaymentMethodChange,
  onCheckout,
}: CartPanelProps) {
  const subtotal = cart.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity - l.lineDiscountAmount,
    0,
  );
  const total = Math.max(0, subtotal - billDiscountAmount);

  return (
    <aside className="border-border bg-card flex h-fit flex-col gap-4 rounded-xl border p-4 lg:sticky lg:top-4">
      <h2 className="font-heading text-lg font-semibold">ตะกร้า</h2>

      {cart.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">แตะเมนูเพื่อเริ่มขาย</p>
      ) : (
        <ul className="max-h-[45vh] space-y-3 overflow-y-auto">
          {cart.map((line) => (
            <li key={line.key} className="border-border/60 border-b pb-3 text-sm last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {line.menuName}
                    {line.variantName && (
                      <span className="text-muted-foreground"> ({line.variantName})</span>
                    )}
                  </p>
                  {line.modifierNames.length > 0 && (
                    <p className="text-muted-foreground text-xs">{line.modifierNames.join(", ")}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveLine(line.key)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="ลบรายการนี้"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.key, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                    className="border-border flex size-7 items-center justify-center rounded-md border disabled:opacity-40"
                    aria-label="ลดจำนวน"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-6 text-center">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.key, line.quantity + 1)}
                    className="border-border flex size-7 items-center justify-center rounded-md border"
                    aria-label="เพิ่มจำนวน"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <span className="font-medium">
                  {formatBaht(line.unitPrice * line.quantity - line.lineDiscountAmount)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Label className="text-muted-foreground text-xs whitespace-nowrap">ส่วนลด</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.lineDiscountAmount || ""}
                  onChange={(e) => onUpdateLineDiscount(line.key, Number(e.target.value) || 0)}
                  className="h-7 text-xs"
                  placeholder="0"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between text-sm">
          <Label className="text-muted-foreground">ส่วนลดทั้งบิล</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={billDiscountAmount || ""}
            onChange={(e) => onBillDiscountChange(Number(e.target.value) || 0)}
            className="h-8 w-24 text-right"
            placeholder="0"
          />
        </div>
        <div className="flex items-center justify-between font-medium">
          <span>ยอดรวม (โดยประมาณ)</span>
          <span className="font-heading text-lg">{formatBaht(total)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={paymentMethod === "cash" ? "default" : "outline"}
          className="flex-1"
          onClick={() => onPaymentMethodChange("cash")}
        >
          เงินสด
        </Button>
        <Button
          type="button"
          variant={paymentMethod === "qr" ? "default" : "outline"}
          className="flex-1"
          onClick={() => onPaymentMethodChange("qr")}
        >
          QR
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        type="button"
        className="h-12 w-full text-base"
        disabled={cart.length === 0 || isCheckingOut}
        onClick={onCheckout}
      >
        {isCheckingOut ? "กำลังบันทึก..." : "ยืนยันการขาย"}
      </Button>
    </aside>
  );
}
