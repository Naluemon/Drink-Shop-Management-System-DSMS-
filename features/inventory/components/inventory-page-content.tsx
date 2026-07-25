"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StockMovementDialog,
  type IngredientOption,
  type ReasonCodeOption,
} from "./stock-movement-dialog";
import { LowStockBanner } from "./low-stock-banner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  stock_in: "รับเข้า",
  stock_out: "จ่ายออก",
  adjustment: "ปรับปรุง",
  reversal: "ย้อนกลับ",
  transfer: "โอนย้าย",
};

// stock_in/stock_out store `quantity` as an unsigned magnitude (direction is
// implied by movement_type); only `adjustment` stores an already-signed delta.
// Displaying the raw stored value's sign would show a stock_out row (a
// decrease) with a misleading "+".
function formatMovementQuantity(m: { movementType: string; quantity: string }): string {
  const magnitude = Math.abs(Number(m.quantity));
  if (m.movementType === "stock_out") return `-${formatNumber(magnitude)}`;
  if (m.movementType === "stock_in") return `+${formatNumber(magnitude)}`;
  const value = Number(m.quantity);
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

export interface StockLevelRow {
  id: string;
  name: string;
  baseUnit: string;
  currentStockQty: string;
  lowStockThreshold: string | null;
}

export interface MovementRow {
  id: string;
  ingredientName: string;
  baseUnit: string;
  movementType: string;
  quantity: string;
  reasonCode: string | null;
  isStockDeficit: boolean;
  createdAt: string;
}

interface InventoryPageContentProps {
  stockLevels: StockLevelRow[];
  recentMovements: MovementRow[] | null;
  reasonCodes: ReasonCodeOption[];
  canAdjust: boolean;
  canRecordMovements: boolean;
}

// Phase 6 — Inventory: low-stock banner (FR-INV-04) + stock levels table +
// record-movement dialog + ledger (Owner/Manager only, see SECURITY.md §1)
export function InventoryPageContent({
  stockLevels,
  recentMovements,
  reasonCodes,
  canAdjust,
  canRecordMovements,
}: InventoryPageContentProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const lowStockItems = stockLevels
    .filter((i) => i.lowStockThreshold && Number(i.currentStockQty) <= Number(i.lowStockThreshold))
    .map((i) => ({
      name: i.name,
      currentStockQty: i.currentStockQty,
      lowStockThreshold: i.lowStockThreshold!,
      baseUnit: i.baseUnit,
    }));

  const ingredientOptions: IngredientOption[] = stockLevels.map((i) => ({
    id: i.id,
    name: i.name,
    baseUnit: i.baseUnit,
  }));

  function handleRecorded() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <LowStockBanner items={lowStockItems} />

      {canRecordMovements && (
        <div className="flex justify-end">
          <StockMovementDialog
            ingredients={ingredientOptions}
            reasonCodes={reasonCodes}
            canAdjust={canAdjust}
            onRecorded={handleRecorded}
          />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-foreground text-lg font-semibold">ระดับสต็อกปัจจุบัน</h2>
          <span className="text-muted-foreground text-sm">ทั้งหมด {stockLevels.length} รายการ</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ลำดับ</TableHead>
              <TableHead>วัตถุดิบ</TableHead>
              <TableHead>สต็อกคงเหลือ</TableHead>
              <TableHead>แจ้งเตือนสต็อกต่ำที่</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stockLevels.map((i, index) => (
              <TableRow key={i.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell>
                  {formatNumber(Number(i.currentStockQty))}{" "}
                  {BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {i.lowStockThreshold ? formatNumber(Number(i.lowStockThreshold)) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {recentMovements && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-foreground text-lg font-semibold">
              ประวัติการเคลื่อนไหวล่าสุด
            </h2>
            <span className="text-muted-foreground text-sm">
              ทั้งหมด {recentMovements.length} รายการ
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">ลำดับ</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>วัตถุดิบ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>จำนวน</TableHead>
                <TableHead>เหตุผล/หมายเหตุ</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    ยังไม่มีรายการ
                  </TableCell>
                </TableRow>
              ) : (
                recentMovements.map((m, index) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(m.createdAt).toLocaleString("th-TH")}
                    </TableCell>
                    <TableCell>{m.ingredientName}</TableCell>
                    <TableCell>{MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}</TableCell>
                    <TableCell>
                      {formatMovementQuantity(m)} {BASE_UNIT_LABELS[m.baseUnit] ?? m.baseUnit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.reasonCode ?? "—"}</TableCell>
                    <TableCell>
                      {m.isStockDeficit && <Badge variant="destructive">สต็อกพร่อง</Badge>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
