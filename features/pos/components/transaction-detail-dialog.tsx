"use client";

import { useEffect, useState, useTransition } from "react";
import { getTransactionDetail } from "../actions/void-refund";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatBaht } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = { cash: "เงินสด", qr: "QR" };

interface TransactionDetail {
  createdAt: string;
  paymentMethod: string;
  discountAmount: string;
  totalAmount: string;
  isVoided: boolean;
  voidReason: string | null;
  hasPendingRefund: boolean;
  items: {
    name: string;
    quantity: number;
    unitPrice: string;
    discountAmount: string;
    modifiers: { name: string; priceDelta: string }[];
  }[];
}

interface TransactionDetailDialogProps {
  transactionId: string | null;
  onOpenChange: (open: boolean) => void;
}

// Row-click detail view for "รายการขายล่าสุด" — unlike the purchase-order
// list, a table row here doesn't carry line items, so this fetches them
// from getTransactionDetail on open instead of reusing data already in props.
export function TransactionDetailDialog({
  transactionId,
  onOpenChange,
}: TransactionDetailDialogProps) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setDetail(null);
      setError(null);
      if (!transactionId) return;
      const result = await getTransactionDetail(transactionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDetail(result.transaction!);
    });
  }, [transactionId]);

  return (
    <Dialog open={transactionId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>รายละเอียดการขาย</DialogTitle>
          <DialogDescription>
            {detail ? new Date(detail.createdAt).toLocaleString("th-TH") : "กำลังโหลดรายละเอียด..."}
          </DialogDescription>
        </DialogHeader>

        {isPending && !detail && !error && (
          <p className="text-muted-foreground text-sm">กำลังโหลด...</p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}

        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">สถานะ</span>
              <Badge
                variant={
                  detail.isVoided ? "outline" : detail.hasPendingRefund ? "secondary" : "default"
                }
              >
                {detail.isVoided
                  ? "ยกเลิกแล้ว"
                  : detail.hasPendingRefund
                    ? "รออนุมัติคืนเงิน"
                    : "สำเร็จ"}
              </Badge>
            </div>

            {detail.isVoided && detail.voidReason && (
              <p className="text-muted-foreground text-xs">เหตุผลยกเลิก: {detail.voidReason}</p>
            )}

            <ul className="space-y-1.5">
              {detail.items.map((item, index) => (
                <li key={index} className="bg-muted/30 rounded-md px-3 py-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <span className="font-medium">
                      {formatBaht(
                        Number(item.unitPrice) * item.quantity - Number(item.discountAmount),
                      )}
                    </span>
                  </div>
                  {item.modifiers.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {item.modifiers.map((m) => m.name).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t pt-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ชำระโดย</span>
                <span>{PAYMENT_LABELS[detail.paymentMethod] ?? detail.paymentMethod}</span>
              </div>
              {Number(detail.discountAmount) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ส่วนลดทั้งบิล</span>
                  <span>-{formatBaht(Number(detail.discountAmount))}</span>
                </div>
              )}
              <div className="flex items-center justify-between font-medium">
                <span>ยอดรวม</span>
                <span className="font-heading text-primary text-lg font-bold tabular-nums">
                  {formatBaht(Number(detail.totalAmount))}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
