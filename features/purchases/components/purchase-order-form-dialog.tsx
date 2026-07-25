"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createPurchaseOrder } from "../actions/purchase-orders";
import {
  PurchaseOrderItemsManager,
  type PurchaseOrderItemRow,
  type IngredientWithUnits,
} from "./purchase-order-items-manager";
import { Button } from "@/components/ui/button";
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

export interface NewPurchaseOrder {
  id: string;
  status: string;
  supplierId: string;
  supplierName: string;
  orderedAt: string;
  receivedAt: null;
  items: PurchaseOrderItemRow[];
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PurchaseOrderFormDialogProps {
  suppliers: SupplierOption[];
  availableIngredients: IngredientWithUnits[];
  onCreated: (order: NewPurchaseOrder) => void;
}

// FR-PUR-02: สร้างใบสั่งซื้อ — เลือกผู้จำหน่ายก่อน แล้วเพิ่มรายการสินค้าต่อ
export function PurchaseOrderFormDialog({
  suppliers,
  availableIngredients,
  onCreated,
}: PurchaseOrderFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [order, setOrder] = useState<NewPurchaseOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSupplierId("");
    setOrder(null);
    setError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPurchaseOrder({ supplierId });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOrder(result.order!);
      onCreated(result.order!);
    });
  }

  function handleItemsChange(items: PurchaseOrderItemRow[]) {
    if (!order) return;
    setOrder({ ...order, items });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus /> สร้างใบสั่งซื้อ
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>สร้างใบสั่งซื้อใหม่</DialogTitle>
          <DialogDescription>เลือกผู้จำหน่ายแล้วเพิ่มรายการสินค้า</DialogDescription>
        </DialogHeader>

        {!order ? (
          <form onSubmit={handleCreate} className="space-y-4">
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกผู้จำหน่าย">
                  {(v: string) => suppliers.find((s) => s.id === v)?.name ?? "เลือกผู้จำหน่าย"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full" disabled={isPending || !supplierId}>
              สร้างใบสั่งซื้อ
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              ผู้จำหน่าย: <strong>{order.supplierName}</strong>
            </p>
            <PurchaseOrderItemsManager
              purchaseOrderId={order.id}
              initialItems={order.items}
              availableIngredients={availableIngredients}
              onItemsChange={handleItemsChange}
            />
            <Button type="button" className="w-full" onClick={() => setOpen(false)}>
              เสร็จสิ้น
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
