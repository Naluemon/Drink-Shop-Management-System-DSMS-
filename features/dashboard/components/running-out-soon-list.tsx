import { formatNumber } from "@/lib/utils";

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

export interface RunningOutSoonItem {
  name: string;
  daysRemaining: number;
  currentStockQty: string;
  baseUnit: string;
}

function urgencyColor(days: number): string {
  return days <= 3 ? "var(--destructive)" : "var(--chart-4)";
}

// Estimated from real stock_out volume over the last 14 days (see
// getIngredientOverview() in features/dashboard/actions/dashboard.ts), not
// the fixed lowStockThreshold LowStockBanner uses — this catches an
// ingredient that's simply being used faster than usual, even while it's
// still above threshold.
export function RunningOutSoonList({ items }: { items: RunningOutSoonItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        ยังไม่มีวัตถุดิบที่คาดว่าจะหมดเร็วๆ นี้ (คำนวณจากอัตราการใช้งานจริงย้อนหลัง 14 วัน)
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        คำนวณจากอัตราการใช้งานจริงย้อนหลัง 14 วัน — ไม่ใช่แค่จำนวนที่ตั้งแจ้งเตือนไว้
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.name}
            className="bg-muted/40 flex items-center justify-between rounded-md border-l-4 px-3 py-1.5 text-sm"
            style={{ borderLeftColor: urgencyColor(item.daysRemaining) }}
          >
            <span className="font-medium">{item.name}</span>
            <span className="text-muted-foreground text-xs">
              เหลือ {formatNumber(Number(item.currentStockQty))}{" "}
              {BASE_UNIT_LABELS[item.baseUnit] ?? item.baseUnit} —{" "}
              <span className="font-semibold" style={{ color: urgencyColor(item.daysRemaining) }}>
                ใช้ได้อีก ~{Math.max(0, Math.round(item.daysRemaining))} วัน
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
