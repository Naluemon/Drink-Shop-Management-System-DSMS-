"use client";

import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LowStockBanner,
  type LowStockItem,
} from "@/features/inventory/components/low-stock-banner";
import type { TrendPoint } from "../actions/dashboard";
import { RevenueTrendChart } from "./revenue-trend-chart";
import { TodayBreakdownBar } from "./today-breakdown-bar";
import { BestSellerBars } from "./best-seller-bars";
import { formatBaht } from "@/lib/utils";

export interface PeriodSummary {
  transactionCount: number;
  revenue: number;
  cogs: number;
  profit: number;
  expenses: number;
  netProfit: number;
}

export interface BestSellerRow {
  name: string;
  qty: number;
}

interface DashboardContentProps {
  today: PeriodSummary;
  yesterday: PeriodSummary;
  bestSellers: BestSellerRow[];
  lowStockItems: LowStockItem[];
  trend: TrendPoint[];
}

// FR-DASH-02: ตัวเลข "วันนี้" เทียบ "เมื่อวาน" (คำนวณตาม business day boundary ทั้งคู่)
function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.005) {
    return (
      <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
        <Minus className="size-3" /> เท่ากับเมื่อวาน
      </span>
    );
  }
  const up = diff > 0;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : null;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs ${up ? "text-accent" : "text-destructive"}`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {pct !== null ? `${up ? "+" : ""}${pct.toFixed(0)}%` : formatBaht(diff)} เทียบเมื่อวาน
    </span>
  );
}

function KpiCard({
  title,
  value,
  delta,
  accentColor,
}: {
  title: string;
  value: string;
  delta?: ReactNode;
  // Fixed entity color (app/globals.css --chart-1..4) — the same swatch this
  // metric uses in the trend/breakdown charts below, so a KPI card and its
  // matching chart line are recognizable as "the same thing" at a glance.
  accentColor?: string;
}) {
  return (
    <Card className="border-l-4" style={accentColor ? { borderLeftColor: accentColor } : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-2xl font-semibold">{value}</div>
        {delta && <div className="mt-1">{delta}</div>}
      </CardContent>
    </Card>
  );
}

// Phase 10 — Dashboard. FR-DASH-01: Today's Sales, Profit, Revenue, Best
// Seller, Low Stock, Expenses, Net Profit — all grouped by business day
// (FR-DASH-02, DECISIONS.md D8), never calendar midnight.
export function DashboardContent({
  today,
  yesterday,
  bestSellers,
  lowStockItems,
  trend,
}: DashboardContentProps) {
  return (
    <div className="space-y-6">
      <LowStockBanner items={lowStockItems} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard
          title="ยอดขายวันนี้ (จำนวนบิล)"
          value={`${today.transactionCount} บิล`}
          delta={
            <DeltaBadge current={today.transactionCount} previous={yesterday.transactionCount} />
          }
        />
        <KpiCard
          title="รายได้ (Revenue)"
          value={formatBaht(today.revenue)}
          delta={<DeltaBadge current={today.revenue} previous={yesterday.revenue} />}
          accentColor="var(--chart-1)"
        />
        <KpiCard
          title="กำไรขั้นต้น (Profit)"
          value={formatBaht(today.profit)}
          delta={<DeltaBadge current={today.profit} previous={yesterday.profit} />}
          accentColor="var(--chart-3)"
        />
        <KpiCard
          title="ค่าใช้จ่ายวันนี้ (Expenses)"
          value={formatBaht(today.expenses)}
          delta={<DeltaBadge current={today.expenses} previous={yesterday.expenses} />}
          accentColor="var(--chart-2)"
        />
        <KpiCard
          title="กำไรสุทธิ (Net Profit)"
          value={formatBaht(today.netProfit)}
          delta={<DeltaBadge current={today.netProfit} previous={yesterday.netProfit} />}
          accentColor="var(--chart-4)"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">แนวโน้ม 7 วันล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart initialData={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนรายได้วันนี้</CardTitle>
          </CardHeader>
          <CardContent>
            <TodayBreakdownBar
              revenue={today.revenue}
              cogs={today.cogs}
              expenses={today.expenses}
              netProfit={today.netProfit}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">เมนูขายดีวันนี้ (Best Seller)</CardTitle>
        </CardHeader>
        <CardContent>
          <BestSellerBars rows={bestSellers} />
        </CardContent>
      </Card>
    </div>
  );
}
