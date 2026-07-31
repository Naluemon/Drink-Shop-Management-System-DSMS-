"use client";

import { Trash2, Minus, Plus, ShoppingCart, Banknote, QrCode } from "lucide-react";
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
    <aside className="border-border bg-card flex h-fit flex-col gap-4 rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="size-4.5" />
          ตะกร้า
        </h2>
        {cart.length > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
            {cart.reduce((sum, l) => sum + l.quantity, 0)} รายการ
          </span>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <ShoppingCart className="size-8 opacity-40" />
          แตะเมนูเพื่อเริ่มขาย
        </div>
      ) : (
        <ul className="max-h-[45vh] space-y-3 overflow-y-auto">
          {cart.map((line) => (
            <li
              key={line.key}
              className="border-border/60 space-y-1.5 border-b border-dashed pb-3 text-sm last:border-0"
            >
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.key, line.quantity - 1)}
                    disabled={line.quantity <= 1}
                    className="border-border flex size-8 items-center justify-center rounded-lg border disabled:opacity-40"
                    aria-label="ลดจำนวน"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-6 text-center font-medium tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(line.key, line.quantity + 1)}
                    className="border-border flex size-8 items-center justify-center rounded-lg border"
                    aria-label="เพิ่มจำนวน"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <span className="font-heading font-semibold tabular-nums">
                  {formatBaht(line.unitPrice * line.quantity - line.lineDiscountAmount)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
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
          <span className="font-heading text-primary text-xl font-bold tabular-nums">
            {formatBaht(total)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={paymentMethod === "cash" ? "default" : "outline"}
          className="flex-1 gap-1.5"
          onClick={() => onPaymentMethodChange("cash")}
        >
          <Banknote className="size-4" />
          เงินสด
        </Button>
        <Button
          type="button"
          variant={paymentMethod === "qr" ? "default" : "outline"}
          className="flex-1 gap-1.5"
          onClick={() => onPaymentMethodChange("qr")}
        >
          <QrCode className="size-4" />
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
