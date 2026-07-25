"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { receivePurchaseOrder, cancelPurchaseOrder } from "../actions/purchase-orders";
import { PurchaseOrderFormDialog, type NewPurchaseOrder } from "./purchase-order-form-dialog";
import type { IngredientWithUnits } from "./purchase-order-items-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/utils";

export interface PurchaseOrderRow extends Omit<NewPurchaseOrder, "receivedAt"> {
  receivedAt: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PurchaseOrderListProps {
  initialOrders: PurchaseOrderRow[];
  suppliers: SupplierOption[];
  availableIngredients: IngredientWithUnits[];
  canEdit: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "รอรับของ",
  received: "รับของแล้ว",
  cancelled: "ยกเลิก",
};

const ALL_SUPPLIERS = "__all__";

// FR-PUR-02/03/04: สร้าง PO, Receive (trigger WAC), ดูประวัติแยกตาม supplier
export function PurchaseOrderList({
  initialOrders,
  suppliers,
  availableIngredients,
  canEdit,
}: PurchaseOrderListProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(ALL_SUPPLIERS);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Matches supplier name, status label, or order total — searching "890"
  // finds every PO around that total just as readily as the supplier name would.
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (supplierFilter !== ALL_SUPPLIERS && o.supplierId !== supplierFilter) return false;
      const term = search.trim().toLowerCase();
      if (!term) return true;
      const total = o.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0);
      return (
        o.supplierName.toLowerCase().includes(term) ||
        (STATUS_LABELS[o.status] ?? o.status).toLowerCase().includes(term) ||
        total.toFixed(2).includes(term)
      );
    });
  }, [orders, search, supplierFilter]);

  const pendingCount = useMemo(() => orders.filter((o) => o.status === "pending").length, [orders]);

  function handleCreated(order: NewPurchaseOrder) {
    setOrders((prev) => [{ ...order, receivedAt: null }, ...prev]);
  }

  function handleReceive(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await receivePurchaseOrder(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, status: "received", receivedAt: new Date().toISOString() } : o,
        ),
      );
      toast.success("รับของเข้าสต็อกสำเร็จ");
    });
  }

  function handleCancel(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelPurchaseOrder(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
      toast.success("ยกเลิกใบสั่งซื้อสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาผู้จำหน่าย สถานะ หรือยอดรวม..."
            className="max-w-xs"
          />
          <Select
            value={supplierFilter}
            onValueChange={(v) => setSupplierFilter(v ?? ALL_SUPPLIERS)}
          >
            <SelectTrigger className="w-56">
              <SelectValue>
                {(v: string) =>
                  v === ALL_SUPPLIERS
                    ? "ทุกผู้จำหน่าย"
                    : (suppliers.find((s) => s.id === v)?.name ?? "ทุกผู้จำหน่าย")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUPPLIERS}>ทุกผู้จำหน่าย</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <PurchaseOrderFormDialog
            suppliers={suppliers}
            availableIngredients={availableIngredients}
            onCreated={handleCreated}
          />
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {pendingCount > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          มีใบสั่งซื้อรอรับของ {pendingCount} รายการ
        </div>
      )}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>วันที่สั่งซื้อ</TableHead>
            <TableHead>ผู้จำหน่าย</TableHead>
            <TableHead>จำนวนรายการ</TableHead>
            <TableHead>ยอดรวม</TableHead>
            <TableHead>สถานะ</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 7 : 6} className="text-muted-foreground text-center">
                ไม่พบใบสั่งซื้อ
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((o, index) => {
              const total = o.items.reduce(
                (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice),
                0,
              );
              return (
                <TableRow key={o.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(o.orderedAt).toLocaleDateString("th-TH")}
                  </TableCell>
                  <TableCell className="font-medium">{o.supplierName}</TableCell>
                  <TableCell>{o.items.length} รายการ</TableCell>
                  <TableCell>{formatBaht(total)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        o.status === "received"
                          ? "default"
                          : o.status === "cancelled"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      {o.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleReceive(o.id)}
                          >
                            รับของ
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button size="sm" variant="destructive" disabled={isPending} />
                            }
                            triggerLabel="ยกเลิก"
                            title={`ยกเลิกใบสั่งซื้อจาก "${o.supplierName}" ใช่ไหม?`}
                            description="ใบสั่งซื้อนี้จะถูกยกเลิกและไม่สามารถรับของตามใบนี้ได้อีก"
                            confirmLabel="ยกเลิกใบสั่งซื้อ"
                            onConfirm={() => handleCancel(o.id)}
                          />
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
