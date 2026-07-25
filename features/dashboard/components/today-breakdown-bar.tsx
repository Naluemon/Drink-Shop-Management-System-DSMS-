import { formatBaht } from "@/lib/utils";

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

interface Segment {
  label: string;
  amount: number;
  color: string; // CSS color, or "var(--muted-foreground)" for the neutral COGS segment
}

// Today's revenue split into its three parts (COGS + Expenses + NetProfit
// always sum back to Revenue) as a single proportional bar — answers
// "สัดส่วนที่ระบุได้ชัดๆ" directly instead of making someone do the
// subtraction themselves from the KPI cards. COGS is deliberately neutral
// (muted-foreground) — only Expenses/NetProfit are named "categories" the
// user asked to color-code; COGS is just what's left of the bar.
export function TodayBreakdownBar({
  revenue,
  cogs,
  expenses,
  netProfit,
}: {
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
}) {
  if (revenue <= 0) {
    return <p className="text-muted-foreground text-sm">ยังไม่มียอดขายวันนี้</p>;
  }

  // A loss day (netProfit < 0) can't be drawn as a simple part-of-whole bar
  // (a negative-width segment is meaningless) — show the real numbers as
  // plain text instead of a bar that would misrepresent them.
  if (netProfit < 0) {
    return (
      <div className="space-y-1.5 text-sm">
        <p className="text-destructive font-medium">
          วันนี้ขาดทุนสุทธิ {formatBaht(Math.abs(netProfit))}
        </p>
        <p className="text-muted-foreground">
          รายได้ {formatBaht(revenue)} — ต้นทุนวัตถุดิบ {formatBaht(cogs)} — ค่าใช้จ่าย{" "}
          {formatBaht(expenses)}
        </p>
      </div>
    );
  }

  const segments: Segment[] = [
    { label: "ต้นทุนวัตถุดิบ", amount: cogs, color: "var(--muted-foreground)" },
    { label: "ค่าใช้จ่าย", amount: expenses, color: "var(--chart-2)" },
    { label: "กำไรสุทธิ", amount: netProfit, color: "var(--chart-4)" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">รายได้รวมวันนี้</span>
        <span className="font-heading text-lg font-semibold" style={{ color: "var(--chart-1)" }}>
          {formatBaht(revenue)}
        </span>
      </div>

      <div className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s) => {
          const width = pct(s.amount, revenue);
          if (width <= 0) return null;
          return (
            <div
              key={s.label}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${width}%`, backgroundColor: s.color }}
              title={`${s.label}: ${formatBaht(s.amount)}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">
              {formatBaht(s.amount)} ({pct(s.amount, revenue).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
