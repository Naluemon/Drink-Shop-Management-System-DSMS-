import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/utils";

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

export interface LowStockItem {
  name: string;
  currentStockQty: string;
  lowStockThreshold: string;
  baseUnit: string;
}

interface LowStockBannerProps {
  items: LowStockItem[];
}

// FR-INV-04: แสดง Low Stock Alert banner เมื่อสต็อกต่ำกว่า threshold ที่ตั้งไว้
export function LowStockBanner({ items }: LowStockBannerProps) {
  if (items.length === 0) return null;

  return (
    <div className="border-secondary bg-secondary/40 text-secondary-foreground rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" />
        สต็อกใกล้หมด {items.length} รายการ
      </div>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {items.map((item) => (
          <li key={item.name}>
            {item.name}: เหลือ {formatNumber(Number(item.currentStockQty))}{" "}
            {BASE_UNIT_LABELS[item.baseUnit] ?? item.baseUnit} (แจ้งเตือนที่ ≤{" "}
            {formatNumber(Number(item.lowStockThreshold))})
          </li>
        ))}
      </ul>
    </div>
  );
}
