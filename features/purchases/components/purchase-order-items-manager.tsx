"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addPurchaseOrderItem, removePurchaseOrderItem } from "../actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBaht } from "@/lib/utils";

export interface PurchaseOrderItemRow {
  id: string;
  ingredientId: string;
  ingredientName: string;
  purchaseUnitName: string;
  quantity: string;
  unitPrice: string;
}

export interface IngredientWithUnits {
  id: string;
  name: string;
  unitConversions: { purchaseUnitName: string }[];
}

interface PurchaseOrderItemsManagerProps {
  purchaseOrderId: string;
  initialItems: PurchaseOrderItemRow[];
  availableIngredients: IngredientWithUnits[];
  onItemsChange?: (rows: PurchaseOrderItemRow[]) => void;
}

// FR-PUR-02: เลือก ingredient + purchase_unit (ต้องมี unit_conversion ตั้งไว้
// แล้วที่หน้าวัตถุดิบ) + quantity + ราคา
export function PurchaseOrderItemsManager({
  purchaseOrderId,
  initialItems,
  availableIngredients,
  onItemsChange,
}: PurchaseOrderItemsManagerProps) {
  const [items, setItems] = useState(initialItems);
  const [ingredientId, setIngredientId] = useState("");
  const [purchaseUnitName, setPurchaseUnitName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedIngredient = availableIngredients.find((i) => i.id === ingredientId);

  function updateItems(next: PurchaseOrderItemRow[]) {
    setItems(next);
    onItemsChange?.(next);
  }

  function handleAdd() {
    if (!ingredientId || !purchaseUnitName || !quantity || !unitPrice) return;
    setError(null);
    startTransition(async () => {
      const result = await addPurchaseOrderItem(purchaseOrderId, {
        ingredientId,
        purchaseUnitName,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.item) {
        updateItems([...items, result.item]);
        toast.success("เพิ่มรายการสำเร็จ");
      }
      setIngredientId("");
      setPurchaseUnitName("");
      setQuantity("");
      setUnitPrice("");
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removePurchaseOrderItem(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      updateItems(items.filter((i) => i.id !== id));
      toast.success("ลบรายการสำเร็จ");
    });
  }

  const total = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0);

  return (
    <div className="space-y-3">
      <Label>รายการสินค้าในใบสั่งซื้อ</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((i) => (
            <li
              key={i.id}
              className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
            >
              <span>
                {i.ingredientName} — {i.quantity} {i.purchaseUnitName} ×{" "}
                {formatBaht(Number(i.unitPrice))} ={" "}
                {formatBaht(Number(i.quantity) * Number(i.unitPrice))}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(i.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="ลบรายการนี้"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
          <li className="px-3 pt-1 text-right text-sm font-medium">รวม {formatBaht(total)}</li>
        </ul>
      )}

      <div className="space-y-2 rounded-lg border p-3">
        <div className="space-y-1">
          <Label className="text-xs">วัตถุดิบ</Label>
          <Select
            value={ingredientId}
            onValueChange={(v) => {
              setIngredientId(v ?? "");
              setPurchaseUnitName("");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกวัตถุดิบ">
                {(v: string) =>
                  availableIngredients.find((i) => i.id === v)?.name ?? "เลือกวัตถุดิบ"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableIngredients.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedIngredient && selectedIngredient.unitConversions.length === 0 ? (
          <p className="text-destructive text-xs">
            วัตถุดิบนี้ยังไม่มีหน่วยซื้อตั้งไว้ — ไปเพิ่มที่หน้าวัตถุดิบก่อน
          </p>
        ) : (
          selectedIngredient && (
            <div className="space-y-1">
              <Label className="text-xs">หน่วยซื้อ</Label>
              <Select value={purchaseUnitName} onValueChange={(v) => setPurchaseUnitName(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกหน่วยซื้อ">
                    {(v: string) => v || "เลือกหน่วยซื้อ"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectedIngredient.unitConversions.map((c) => (
                    <SelectItem key={c.purchaseUnitName} value={c.purchaseUnitName}>
                      {c.purchaseUnitName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">จำนวน</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ราคาต่อหน่วยซื้อ (บาท)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={isPending || !ingredientId || !purchaseUnitName || !quantity || !unitPrice}
          onClick={handleAdd}
        >
          เพิ่มรายการ
        </Button>
      </div>
    </div>
  );
}
