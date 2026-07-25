"use client";

import { useState, useTransition } from "react";
import { approveRefund, rejectRefund } from "../actions/void-refund";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/utils";

export interface RefundQueueRow {
  id: string;
  salesTransactionId: string;
  totalAmount: string;
  reason: string;
  requestedBy: string;
  createdAt: string;
  withinOwnApprovalLimit: boolean;
}

interface RefundQueueProps {
  initialRequests: RefundQueueRow[];
  threshold: string;
  canApproveAny: boolean;
}

// FR-POS-11 / DECISIONS.md D5, D14: Shift Supervisor เห็น/อนุมัติเฉพาะยอด ≤
// threshold, Owner/Manager เห็นและอนุมัติได้ทุกยอด (listRefundQueue กรองมาแล้ว
// ฝั่ง server แต่ badge ตรงนี้ช่วยอธิบายเหตุผลให้ Shift Supervisor เข้าใจ)
export function RefundQueue({ initialRequests, threshold, canApproveAny }: RefundQueueProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveRefund(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    });
  }

  function handleReject(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await rejectRefund(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <div className="space-y-3">
      {!canApproveAny && (
        <p className="text-muted-foreground text-xs">
          คุณอนุมัติได้เองเฉพาะยอดไม่เกิน {formatBaht(Number(threshold))} (DECISIONS.md D5/D14) —
          ยอดที่เกินต้องส่งต่อ Manager/Owner
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-muted-foreground text-sm">ไม่มีคำขอคืนเงินค้างอยู่</p>
      ) : (
        requests.map((r) => (
          <div
            key={r.id}
            data-testid="refund-request-row"
            className="border-border/60 rounded-lg border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {formatBaht(Number(r.totalAmount))}
                  {!r.withinOwnApprovalLimit && (
                    <Badge variant="destructive" className="ml-2">
                      เกินวงเงิน
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">เหตุผล: {r.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(r.createdAt).toLocaleString("th-TH")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={isPending} onClick={() => handleApprove(r.id)}>
                  อนุมัติ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleReject(r.id)}
                >
                  ปฏิเสธ
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
