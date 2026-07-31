"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Ban, RotateCcw } from "lucide-react";
import { toast } from "@/lib/sweet-alert";
import { voidTransaction, requestRefund } from "../actions/void-refund";
import { TransactionDetailDialog } from "./transaction-detail-dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
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
  page: number;
  totalPages: number;
  total: number;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "เงินสด", qr: "QR" };

function statusIcon(t: RecentTransactionRow) {
  if (t.isVoided) return Ban;
  if (t.hasPendingRefund) return RotateCcw;
  return CheckCircle2;
}

// FR-POS-09 (Void, วันทางธุรกิจเดียวกัน) / FR-POS-10 (Request Refund, ข้ามวัน)
export function RecentTransactionsPanel({
  initialTransactions,
  page,
  totalPages,
  total,
}: RecentTransactionsPanelProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  // Paging is a Link to /pos?page=N (see PaginationControls below) — a plain
  // client-side navigation within the same layout, which reuses this
  // component instance rather than remounting it. Without this sync,
  // `transactions` would keep showing the previous page's rows forever
  // (useState only reads its initializer once), same fix as ingredient-list.tsx.
  const [prevInitialTransactions, setPrevInitialTransactions] = useState(initialTransactions);
  if (initialTransactions !== prevInitialTransactions) {
    setPrevInitialTransactions(initialTransactions);
    setTransactions(initialTransactions);
  }
  const [actionTarget, setActionTarget] = useState<{ id: string; mode: "void" | "refund" } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      toast.success(actionTarget.mode === "void" ? "ยกเลิกรายการสำเร็จ" : "ส่งคำขอคืนเงินสำเร็จ");
      setActionTarget(null);
      setReason("");
    });
  }

  return (
    <div className="space-y-2">
      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm">ยังไม่มีรายการขายล่าสุด</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead>ยอดเงิน</TableHead>
              <TableHead>ชำระ</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => {
              const Icon = statusIcon(t);
              return (
                <TableRow
                  key={t.id}
                  data-testid="recent-transaction-row"
                  className="cursor-pointer"
                  onClick={() => setSelectedId(t.id)}
                >
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleString("th-TH")}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {formatBaht(Number(t.totalAmount))}
                  </TableCell>
                  <TableCell>{PAYMENT_LABELS[t.paymentMethod] ?? t.paymentMethod}</TableCell>
                  <TableCell>{t.itemCount} รายการ</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        t.isVoided ? "outline" : t.hasPendingRefund ? "secondary" : "default"
                      }
                    >
                      <Icon className="size-3" />
                      {t.isVoided
                        ? "ยกเลิกแล้ว"
                        : t.hasPendingRefund
                          ? "รออนุมัติคืนเงิน"
                          : "สำเร็จ"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {!t.isVoided &&
                      !t.hasPendingRefund &&
                      (t.isWithinBusinessDay ? (
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
                      ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} basePath="/pos" />

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

      <TransactionDetailDialog
        transactionId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}
