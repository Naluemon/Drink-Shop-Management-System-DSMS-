import type { BestSellerRow } from "./dashboard-content";
import { colorForCategory } from "@/lib/category-color";

// Ranked magnitude — one series (quantity sold) per bar, colored by the
// menu's category so identity (which category is winning today) reads
// alongside the ranking; the category name is always shown as a direct
// text label too, since color alone must never carry meaning.
export function BestSellerBars({ rows }: { rows: BestSellerRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูลขายวันนี้</p>;
  }

  const maxQty = Math.max(...rows.map((r) => r.qty));

  return (
    <div className="space-y-2.5">
      {rows.map((r, idx) => {
        const { color, label } = colorForCategory(r.categoryName);
        return (
          <div key={r.name} className="flex items-center gap-3">
            <span className="text-muted-foreground w-5 shrink-0 text-right text-xs font-medium tabular-nums">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">({label})</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {r.qty} ที่
                </span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${maxQty > 0 ? (r.qty / maxQty) * 100 : 0}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
