"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StockMovementDialog,
  type IngredientOption,
  type ReasonCodeOption,
} from "./stock-movement-dialog";
import { LowStockBanner } from "./low-stock-banner";
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

export interface StockLevelRow {
  id: string;
  name: string;
  baseUnit: string;
  currentStockQty: string;
  lowStockThreshold: string | null;
}

interface InventoryPageContentProps {
  stockLevels: StockLevelRow[];
  reasonCodes: ReasonCodeOption[];
  canAdjust: boolean;
  canRecordMovements: boolean;
}

// Phase 6 — Inventory: low-stock banner (FR-INV-04) + stock levels table +
// record-movement dialog (Owner/Manager only, see SECURITY.md §1). The
// movement ledger itself is rendered separately in app/inventory/page.tsx
// (features/inventory/components/movement-ledger.tsx) since it's paginated
// and streams in behind its own Suspense boundary.
export function InventoryPageContent({
  stockLevels,
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
    </div>
  );
}
