"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatBaht } from "@/lib/utils";
import type { PurchaseOrderRow } from "./purchase-order-list";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอรับของ",
  received: "รับของแล้ว",
  cancelled: "ยกเลิก",
};

interface PurchaseOrderDetailDialogProps {
  order: PurchaseOrderRow | null;
  onOpenChange: (open: boolean) => void;
}

// Read-only detail view opened by clicking a row in PurchaseOrderList —
// the row data already has everything (items included), so this needs no
// server round-trip of its own.
export function PurchaseOrderDetailDialog({ order, onOpenChange }: PurchaseOrderDetailDialogProps) {
  const total = order
    ? order.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0)
    : 0;

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>ใบสั่งซื้อ — {order.supplierName}</DialogTitle>
              <DialogDescription>
                สั่งซื้อวันที่ {new Date(order.orderedAt).toLocaleDateString("th-TH")}
                {order.receivedAt &&
                  ` · รับของวันที่ ${new Date(order.receivedAt).toLocaleDateString("th-TH")}`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">สถานะ</span>
              <Badge
                variant={
                  order.status === "received"
                    ? "default"
                    : order.status === "cancelled"
                      ? "outline"
                      : "secondary"
                }
              >
                {STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </div>

            {order.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">ไม่มีรายการสินค้า</p>
            ) : (
              <ul className="space-y-1">
                {order.items.map((i) => (
                  <li
                    key={i.id}
                    className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                  >
                    <span>
                      {i.ingredientName} — {i.quantity} {i.purchaseUnitName} ×{" "}
                      {formatBaht(Number(i.unitPrice))}
                    </span>
                    <span className="font-medium">
                      {formatBaht(Number(i.quantity) * Number(i.unitPrice))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
              <span>ยอดรวม</span>
              <span>{formatBaht(total)}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
