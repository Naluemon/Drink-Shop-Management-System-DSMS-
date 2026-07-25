"use client";

import { useState, useTransition } from "react";
import { Download, FileText } from "lucide-react";
import {
  getSalesReport,
  getProfitReport,
  getExpenseReport,
  getTopMenuReport,
  getInventoryReport,
  exportSalesReportPdf,
} from "../actions/reports";
import { toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatNumber } from "@/lib/utils";

type Granularity = "daily" | "weekly" | "monthly" | "yearly";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  yearly: "รายปี",
};

// Uses the Date object's own LOCAL calendar components, not toISOString()'s
// UTC conversion — round-tripping through UTC shifts the date back a day
// whenever the runtime's local timezone is ahead of UTC (e.g. Asia/Bangkok),
// turning "1st of this month" into "last day of the previous month".
function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toDateInputValue(from), to: toDateInputValue(now) };
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64Pdf(filename: string, base64: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DateRangeControls({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">จากวันที่</Label>
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">ถึงวันที่</Label>
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
      </div>
    </div>
  );
}

function GranularitySelect({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (v: Granularity) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">ช่วงเวลา</Label>
      <Select value={value} onValueChange={(v) => onChange((v ?? "daily") as Granularity)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="ช่วงเวลา">
            {(v: string) => GRANULARITY_LABELS[v as Granularity] ?? v}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
            <SelectItem key={g} value={g}>
              {GRANULARITY_LABELS[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface SalesRow {
  label: string;
  transactionCount: number;
  revenue: number;
}

function SalesReportTab() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [totals, setTotals] = useState({ transactionCount: 0, revenue: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getSalesReport({ granularity, from, to });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows ?? []);
      setTotals(result.totals ?? { transactionCount: 0, revenue: 0 });
    });
  }

  function handleExportCsv() {
    const csv = toCsv(rows, [
      { key: "label", label: "ช่วงเวลา" },
      { key: "transactionCount", label: "จำนวนบิล" },
      { key: (r) => r.revenue.toFixed(2), label: "รายได้ (บาท)" },
    ]);
    downloadCsv(`sales-report-${from}-to-${to}.csv`, csv);
  }

  function handleExportPdf() {
    setError(null);
    setIsExportingPdf(true);
    startTransition(async () => {
      const result = await exportSalesReportPdf({ granularity, from, to });
      setIsExportingPdf(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (!result.pdfBase64) {
        setError("สร้าง PDF ไม่สำเร็จ");
        return;
      }
      downloadBase64Pdf(`sales-report-${from}-to-${to}.pdf`, result.pdfBase64);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <GranularitySelect value={granularity} onChange={setGranularity} />
          <DateRangeControls
            from={from}
            to={to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
          />
          <Button type="button" disabled={isPending} onClick={load}>
            แสดงรายงาน
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={handleExportCsv}
          >
            <Download /> CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isExportingPdf}
            onClick={handleExportPdf}
          >
            <FileText /> {isExportingPdf ? "กำลังสร้าง PDF..." : "PDF"}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ช่วงเวลา</TableHead>
            <TableHead className="text-right">จำนวนบิล</TableHead>
            <TableHead className="text-right">รายได้</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground text-center">
                เลือกช่วงวันที่แล้วกด &quot;แสดงรายงาน&quot; เพื่อดูข้อมูล
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-right">{formatNumber(r.transactionCount, 0)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.revenue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 && (
          <tfoot>
            <TableRow className="font-semibold">
              <TableCell>รวมทั้งหมด</TableCell>
              <TableCell className="text-right">
                {formatNumber(totals.transactionCount, 0)}
              </TableCell>
              <TableCell className="text-right">{formatBaht(totals.revenue)}</TableCell>
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  );
}

interface ProfitRow {
  label: string;
  revenue: number;
  cogs: number;
  profit: number;
  expenses: number;
  netProfit: number;
}

function ProfitReportTab() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [totals, setTotals] = useState({
    revenue: 0,
    cogs: 0,
    profit: 0,
    expenses: 0,
    netProfit: 0,
  });
  const [expenseByCategory, setExpenseByCategory] = useState<{ name: string; total: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getProfitReport({ granularity, from, to });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows ?? []);
      setTotals(result.totals ?? { revenue: 0, cogs: 0, profit: 0, expenses: 0, netProfit: 0 });
      setExpenseByCategory(result.expenseByCategory ?? []);
    });
  }

  function handleExportCsv() {
    const csv = toCsv(rows, [
      { key: "label", label: "ช่วงเวลา" },
      { key: (r) => r.revenue.toFixed(2), label: "รายได้" },
      { key: (r) => r.cogs.toFixed(2), label: "ต้นทุนขาย" },
      { key: (r) => r.profit.toFixed(2), label: "กำไรขั้นต้น" },
      { key: (r) => r.expenses.toFixed(2), label: "ค่าใช้จ่าย" },
      { key: (r) => r.netProfit.toFixed(2), label: "กำไรสุทธิ" },
    ]);
    downloadCsv(`profit-report-${from}-to-${to}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <GranularitySelect value={granularity} onChange={setGranularity} />
          <DateRangeControls
            from={from}
            to={to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
          />
          <Button type="button" disabled={isPending} onClick={load}>
            แสดงรายงาน
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={handleExportCsv}
        >
          <Download /> CSV
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ช่วงเวลา</TableHead>
            <TableHead className="text-right">รายได้</TableHead>
            <TableHead className="text-right">ต้นทุนขาย</TableHead>
            <TableHead className="text-right">กำไรขั้นต้น</TableHead>
            <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
            <TableHead className="text-right">กำไรสุทธิ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                เลือกช่วงวันที่แล้วกด &quot;แสดงรายงาน&quot; เพื่อดูข้อมูล
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-right">{formatBaht(r.revenue)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.cogs)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.profit)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.expenses)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.netProfit)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 && (
          <tfoot>
            <TableRow className="font-semibold">
              <TableCell>รวมทั้งหมด</TableCell>
              <TableCell className="text-right">{formatBaht(totals.revenue)}</TableCell>
              <TableCell className="text-right">{formatBaht(totals.cogs)}</TableCell>
              <TableCell className="text-right">{formatBaht(totals.profit)}</TableCell>
              <TableCell className="text-right">{formatBaht(totals.expenses)}</TableCell>
              <TableCell className="text-right">{formatBaht(totals.netProfit)}</TableCell>
            </TableRow>
          </tfoot>
        )}
      </Table>

      {expenseByCategory.length > 0 && (
        <div>
          <h3 className="font-heading text-foreground mb-2 text-sm font-semibold">
            ค่าใช้จ่ายแยกตามหมวดหมู่ (ทั้งหมด {expenseByCategory.length} หมวด)
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>หมวดหมู่</TableHead>
                <TableHead className="text-right">ยอดสุทธิ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseByCategory.map((c) => (
                <TableRow key={c.name}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">{formatBaht(c.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ExpenseReportTab() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<{ name: string; total: number }[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getExpenseReport({ from, to });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows ?? []);
      setGrandTotal(result.grandTotal ?? 0);
    });
  }

  function handleExportCsv() {
    const csv = toCsv(rows, [
      { key: "name", label: "หมวดหมู่" },
      { key: (r) => r.total.toFixed(2), label: "ยอดสุทธิ" },
    ]);
    downloadCsv(`expense-report-${from}-to-${to}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeControls
            from={from}
            to={to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
          />
          <Button type="button" disabled={isPending} onClick={load}>
            แสดงรายงาน
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={handleExportCsv}
        >
          <Download /> CSV
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>หมวดหมู่</TableHead>
            <TableHead className="text-right">ยอดสุทธิ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-muted-foreground text-center">
                เลือกช่วงวันที่แล้วกด &quot;แสดงรายงาน&quot; เพื่อดูข้อมูล
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{formatBaht(r.total)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 && (
          <tfoot>
            <TableRow className="font-semibold">
              <TableCell>รวมทั้งหมด</TableCell>
              <TableCell className="text-right">{formatBaht(grandTotal)}</TableCell>
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  );
}

function TopMenuReportTab() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getTopMenuReport({ from, to });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows ?? []);
    });
  }

  function handleExportCsv() {
    const csv = toCsv(rows, [
      { key: "name", label: "เมนู" },
      { key: "qty", label: "จำนวนที่ขาย" },
      { key: (r) => r.revenue.toFixed(2), label: "รายได้" },
    ]);
    downloadCsv(`top-menu-report-${from}-to-${to}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeControls
            from={from}
            to={to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
          />
          <Button type="button" disabled={isPending} onClick={load}>
            แสดงรายงาน
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={handleExportCsv}
        >
          <Download /> CSV
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>อันดับ</TableHead>
            <TableHead>เมนู</TableHead>
            <TableHead className="text-right">จำนวนที่ขาย</TableHead>
            <TableHead className="text-right">รายได้</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-center">
                เลือกช่วงวันที่แล้วกด &quot;แสดงรายงาน&quot; เพื่อดูข้อมูล
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, idx) => (
              <TableRow key={r.name}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">{formatNumber(r.qty, 0)}</TableCell>
                <TableCell className="text-right">{formatBaht(r.revenue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface InventoryRow {
  name: string;
  baseUnit: string;
  currentStockQty: number;
  costPerUnit: number;
  valuation: number;
  stockIn: number;
  stockOut: number;
  adjustmentNet: number;
}

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

function InventoryReportTab() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [totalValuation, setTotalValuation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await getInventoryReport({ from, to });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows ?? []);
      setTotalValuation(result.totalValuation ?? 0);
    });
  }

  function handleExportCsv() {
    const csv = toCsv(rows, [
      { key: "name", label: "วัตถุดิบ" },
      { key: (r) => r.currentStockQty.toFixed(2), label: "คงเหลือ" },
      { key: (r) => r.costPerUnit.toFixed(4), label: "ต้นทุนต่อหน่วย" },
      { key: (r) => r.valuation.toFixed(2), label: "มูลค่าคงเหลือ" },
      { key: (r) => r.stockIn.toFixed(2), label: "รับเข้า (ช่วงที่เลือก)" },
      { key: (r) => r.stockOut.toFixed(2), label: "จ่ายออก (ช่วงที่เลือก)" },
      { key: (r) => r.adjustmentNet.toFixed(2), label: "ปรับปรุงสุทธิ (ช่วงที่เลือก)" },
    ]);
    downloadCsv(`inventory-report-${from}-to-${to}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeControls
            from={from}
            to={to}
            onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
            onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
          />
          <Button type="button" disabled={isPending} onClick={load}>
            แสดงรายงาน
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={handleExportCsv}
        >
          <Download /> CSV
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">
        มูลค่าสต็อกคงเหลือรวม:{" "}
        <span className="text-foreground font-semibold">{formatBaht(totalValuation)}</span>
        {" · "}ทั้งหมด {rows.length} รายการ
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วัตถุดิบ</TableHead>
            <TableHead className="text-right">คงเหลือ</TableHead>
            <TableHead className="text-right">มูลค่า</TableHead>
            <TableHead className="text-right">รับเข้า</TableHead>
            <TableHead className="text-right">จ่ายออก</TableHead>
            <TableHead className="text-right">ปรับปรุงสุทธิ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                เลือกช่วงวันที่แล้วกด &quot;แสดงรายงาน&quot; เพื่อดูข้อมูล
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">
                  {formatNumber(r.currentStockQty)} {BASE_UNIT_LABELS[r.baseUnit] ?? r.baseUnit}
                </TableCell>
                <TableCell className="text-right">{formatBaht(r.valuation)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.stockIn)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.stockOut)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.adjustmentNet)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface ReportsPageContentProps {
  canViewOperational: boolean; // Top Menu / Inventory — FR-RPT-06: Accountant excluded
}

// Phase 11 — Reports. FR-RPT-01/02: Sales/Profit (Daily/Weekly/Monthly/Yearly),
// Expense, Top Menu, Inventory — Accountant only sees Sales/Profit/Expense (D14).
export function ReportsPageContent({ canViewOperational }: ReportsPageContentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">รายงาน</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sales">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="sales">ยอดขาย</TabsTrigger>
            <TabsTrigger value="profit">กำไร</TabsTrigger>
            <TabsTrigger value="expense">ค่าใช้จ่าย</TabsTrigger>
            {canViewOperational && <TabsTrigger value="topmenu">เมนูขายดี</TabsTrigger>}
            {canViewOperational && <TabsTrigger value="inventory">สต็อก</TabsTrigger>}
          </TabsList>

          <TabsContent value="sales" className="pt-4">
            <SalesReportTab />
          </TabsContent>
          <TabsContent value="profit" className="pt-4">
            <ProfitReportTab />
          </TabsContent>
          <TabsContent value="expense" className="pt-4">
            <ExpenseReportTab />
          </TabsContent>
          {canViewOperational && (
            <TabsContent value="topmenu" className="pt-4">
              <TopMenuReportTab />
            </TabsContent>
          )}
          {canViewOperational && (
            <TabsContent value="inventory" className="pt-4">
              <InventoryReportTab />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
