import { listRecentMovements } from "../actions/inventory";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { formatNumber } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, getSkip } from "@/lib/pagination";

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

// Async server component fetching just this page's slice of the ledger —
// rendered inside a <Suspense> in app/inventory/page.tsx so pagination and
// mutation-triggered router.refresh() only re-loading this section (with a
// skeleton fallback) instead of the whole page.
export async function MovementLedger({ page }: { page: number }) {
  const result = await listRecentMovements(page);
  const movements = result.movements ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-foreground text-lg font-semibold">
          ประวัติการเคลื่อนไหวล่าสุด
        </h2>
        <span className="text-muted-foreground text-sm">ทั้งหมด {result.total ?? 0} รายการ</span>
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
          {movements.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground text-center">
                ยังไม่มีรายการ
              </TableCell>
            </TableRow>
          ) : (
            movements.map((m, index) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">
                  {getSkip(result.page ?? 1, DEFAULT_PAGE_SIZE) + index + 1}
                </TableCell>
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
      <PaginationControls
        page={result.page ?? 1}
        totalPages={result.totalPages ?? 1}
        total={result.total ?? 0}
        basePath="/inventory"
      />
    </div>
  );
}
