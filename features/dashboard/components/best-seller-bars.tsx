import type { BestSellerRow } from "./dashboard-content";

// Ranked magnitude — one series (quantity sold), so one hue (brand primary)
// is correct per the dataviz form rules; a bar's length reads faster than a
// table column for "who's in the lead" at a glance.
export function BestSellerBars({ rows }: { rows: BestSellerRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูลขายวันนี้</p>;
  }

  const maxQty = Math.max(...rows.map((r) => r.qty));

  return (
    <div className="space-y-2.5">
      {rows.map((r, idx) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="text-muted-foreground w-5 shrink-0 text-right text-xs font-medium tabular-nums">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {r.qty} ที่
              </span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${maxQty > 0 ? (r.qty / maxQty) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
