"use client";

import { useState, useTransition } from "react";
import { voidTransaction, requestRefund } from "../actions/void-refund";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaht } from "@/lib/utils";

export interface RecentTransactionRow {
  id: string;
  totalAmount: string;
  paymentMethod: string;
  itemCount: number;
  createdAt: string;
  isVoided: boolean;
  hasPendingRefund: boolean;
  isWithinBusinessDay: boolean;
}

interface RecentTransactionsPanelProps {
  initialTransactions: RecentTransactionRow[];
}

const PAYMENT_LABELS: Record<string, string> = { cash: "เงินสด", qr: "QR" };

// FR-POS-09 (Void, วันทางธุรกิจเดียวกัน) / FR-POS-10 (Request Refund, ข้ามวัน)
export function RecentTransactionsPanel({ initialTransactions }: RecentTransactionsPanelProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [actionTarget, setActionTarget] = useState<{ id: string; mode: "void" | "refund" } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!actionTarget || !reason.trim()) return;
    setError(null);
    startTransition(async () => {
      const result =
        actionTarget.mode === "void"
          ? await voidTransaction(actionTarget.id, reason)
          : await requestRefund(actionTarget.id, reason);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === actionTarget.id
            ? {
                ...t,
                isVoided: actionTarget.mode === "void" ? true : t.isVoided,
                hasPendingRefund: actionTarget.mode === "refund" ? true : t.hasPendingRefund,
              }
            : t,
        ),
      );
      setActionTarget(null);
      setReason("");
    });
  }

  if (transactions.length === 0) {
    return <p className="text-muted-foreground text-sm">ยังไม่มีรายการขายล่าสุด</p>;
  }

  return (
    <div className="space-y-2">
      {transactions.map((t) => (
        <div
          key={t.id}
          className="border-border/60 flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
        >
          <div>
            <p className="font-medium">
              {formatBaht(Number(t.totalAmount))} ·{" "}
              {PAYMENT_LABELS[t.paymentMethod] ?? t.paymentMethod} · {t.itemCount} รายการ
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(t.createdAt).toLocaleString("th-TH")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {t.isVoided ? (
              <Badge variant="outline">ยกเลิกแล้ว</Badge>
            ) : t.hasPendingRefund ? (
              <Badge variant="secondary">รออนุมัติคืนเงิน</Badge>
            ) : t.isWithinBusinessDay ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setActionTarget({ id: t.id, mode: "void" })}
              >
                ยกเลิก (Void)
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActionTarget({ id: t.id, mode: "refund" })}
              >
                ขอคืนเงิน
              </Button>
            )}
          </div>
        </div>
      ))}

      <Dialog open={!!actionTarget} onOpenChange={(next) => !next && setActionTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.mode === "void" ? "ยกเลิกรายการขาย" : "ขอคืนเงิน"}
            </DialogTitle>
            <DialogDescription>กรุณาระบุเหตุผล (บังคับ)</DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ลูกค้าเปลี่ยนใจ / กดผิด"
          />
          <Button
            type="button"
            variant={actionTarget?.mode === "void" ? "destructive" : "default"}
            className="w-full"
            disabled={!reason.trim() || isPending}
            onClick={handleSubmit}
          >
            {actionTarget?.mode === "void" ? "ยืนยันยกเลิก" : "ส่งคำขอคืนเงิน"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
