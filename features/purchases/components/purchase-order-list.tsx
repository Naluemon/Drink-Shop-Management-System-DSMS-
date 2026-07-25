"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { PaginationControls } from "@/components/pagination-controls";
import { formatBaht } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";

export interface PurchaseOrderRow extends Omit<NewPurchaseOrder, "receivedAt"> {
  receivedAt: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PurchaseOrderListProps {
  orders: PurchaseOrderRow[];
  suppliers: SupplierOption[];
  availableIngredients: IngredientWithUnits[];
  canEdit: boolean;
  supplierFilter?: string;
  pendingCount: number;
  page: number;
  totalPages: number;
  total: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "รอรับของ",
  received: "รับของแล้ว",
  cancelled: "ยกเลิก",
};

const ALL_SUPPLIERS = "__all__";

// FR-PUR-02/03/04: สร้าง PO, Receive (trigger WAC), ดูประวัติแยกตาม supplier.
// `orders` is one page fetched server-side (features/purchases/actions/purchase-orders.ts)
// — the supplier filter navigates (re-fetches from the server); the search box
// only narrows what's already on this page, since searching the full history
// server-side would defeat the point of paginating it.
export function PurchaseOrderList({
  orders,
  suppliers,
  availableIngredients,
  canEdit,
  supplierFilter,
  pendingCount,
  page,
  totalPages,
  total,
}: PurchaseOrderListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) => {
      const orderTotal = o.items.reduce(
        (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice),
        0,
      );
      return (
        o.supplierName.toLowerCase().includes(term) ||
        (STATUS_LABELS[o.status] ?? o.status).toLowerCase().includes(term) ||
        orderTotal.toFixed(2).includes(term)
      );
    });
  }, [orders, search]);

  function handleSupplierFilterChange(value: string) {
    const params = new URLSearchParams();
    if (value !== ALL_SUPPLIERS) params.set("supplier", value);
    startTransition(() => router.push(`/purchases?${params.toString()}`));
  }

  function handleCreated(_order: NewPurchaseOrder) {
    startTransition(() => router.refresh());
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
      toast.success("รับของเข้าสต็อกสำเร็จ");
      router.refresh();
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
      toast.success("ยกเลิกใบสั่งซื้อสำเร็จ");
      router.refresh();
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
            value={supplierFilter ?? ALL_SUPPLIERS}
            onValueChange={(v) => handleSupplierFilterChange(v ?? ALL_SUPPLIERS)}
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

      <p className="text-muted-foreground text-sm">
        {search.trim()
          ? `พบ ${filtered.length} จาก ${orders.length} รายการในหน้านี้`
          : `ในหน้านี้ ${orders.length} รายการ (ทั้งหมด ${total} รายการ)`}
      </p>

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
              const orderTotal = o.items.reduce(
                (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice),
                0,
              );
              return (
                <TableRow key={o.id}>
                  <TableCell className="text-muted-foreground">
                    {getSkip(page, DEFAULT_PAGE_SIZE) + index + 1}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(o.orderedAt).toLocaleDateString("th-TH")}
                  </TableCell>
                  <TableCell className="font-medium">{o.supplierName}</TableCell>
                  <TableCell>{o.items.length} รายการ</TableCell>
                  <TableCell>{formatBaht(orderTotal)}</TableCell>
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

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/purchases"
        searchParams={{ supplier: supplierFilter }}
      />
    </div>
  );
}
