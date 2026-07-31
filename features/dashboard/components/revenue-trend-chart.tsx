"use client";

import { useState, useTransition } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "@/lib/sweet-alert";
import { getDashboardTrend, type TrendPoint, type DashboardRange } from "../actions/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBaht } from "@/lib/utils";

// Fixed entity→color mapping — same slots as the KPI cards (app/globals.css):
// chart-1 Revenue, chart-2 Expenses, chart-4 NetProfit. Validated with the
// dataviz skill's palette validator against this app's actual surfaces.
const SERIES = [
  { key: "revenue", label: "รายได้", color: "var(--chart-1)" },
  { key: "expenses", label: "ค่าใช้จ่าย", color: "var(--chart-2)" },
  { key: "netProfit", label: "กำไรสุทธิ", color: "var(--chart-4)" },
] as const;

const RANGE_LABELS: Record<DashboardRange, string> = {
  "7d": "7 วัน",
  "30d": "30 วัน",
  "3m": "ไตรมาส (3 เดือน)",
  "6m": "6 เดือน",
  "9m": "9 เดือน",
  "12m": "12 เดือน (1 ปี)",
};

const RANGE_OPTIONS = Object.keys(RANGE_LABELS) as DashboardRange[];
const MONTHLY_RANGES: ReadonlySet<DashboardRange> = new Set(["3m", "6m", "9m", "12m"]);

function formatAxisDate(iso: string, monthly: boolean): string {
  return monthly
    ? new Date(iso).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })
    : new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function TrendTooltip({
  active,
  payload,
  label,
  monthly,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  monthly: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground ring-foreground/10 rounded-lg p-3 text-xs shadow-md ring-1">
      <p className="text-muted-foreground mb-1.5 font-medium">
        {label ? formatAxisDate(label, monthly) : ""}
      </p>
      <div className="space-y-1">
        {SERIES.map((s) => {
          const point = payload.find((p) => p.dataKey === s.key);
          if (!point) return null;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums">{formatBaht(point.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Phase 10 dashboard redesign — trend for revenue/expenses/net profit with a
// selectable window (7 days through 1 year), so "is this getting better or
// worse" is answerable over whichever horizon matters, not just a fixed week.
export function RevenueTrendChart({ initialData }: { initialData: TrendPoint[] }) {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const monthly = MONTHLY_RANGES.has(range);

  function handleRangeChange(next: DashboardRange) {
    setRange(next);
    startTransition(async () => {
      const result = await getDashboardTrend(next);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setData(result.trend);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Select value={range} onValueChange={(v) => v && handleRangeChange(v as DashboardRange)}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue>{(v: string) => RANGE_LABELS[v as DashboardRange] ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {RANGE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={`h-64 w-full transition-opacity ${isPending ? "opacity-50" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatAxisDate(v, monthly)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={monthly ? 16 : 8}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => v.toLocaleString("th-TH")}
            />
            <Tooltip content={<TrendTooltip monthly={monthly} />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
              formatter={(value: string) => SERIES.find((s) => s.key === value)?.label ?? value}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={monthly ? false : { r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
