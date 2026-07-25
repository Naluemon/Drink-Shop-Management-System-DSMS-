"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { getExpenseSlipUrl } from "../actions/expense";
import { CategoryManager, type CategoryRow } from "./category-manager";
import { ExpenseEntryDialog } from "./expense-entry-dialog";
import { ExpenseAdjustmentDialog } from "./expense-adjustment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatBaht } from "@/lib/utils";

const ALL_CATEGORIES = "__all__";

export interface ExpenseEntryRow {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  description: string | null;
  hasSlip: boolean;
  reversalOfId: string | null;
  createdAt: string;
}

// Opens a blank tab synchronously (within the click's event handler, so
// popup blockers don't treat it as an unsolicited popup), then points it at
// the signed URL once the server action resolves.
async function handleViewSlip(entryId: string) {
  const tab = window.open("", "_blank");
  const result = await getExpenseSlipUrl(entryId);
  if (result?.error || !result?.url) {
    tab?.close();
    toast.error(result?.error ?? "เปิดสลิปไม่สำเร็จ");
    return;
  }
  if (!tab) {
    toast.error("เบราว์เซอร์บล็อกการเปิดแท็บใหม่ กรุณาอนุญาต popup แล้วลองใหม่");
    return;
  }
  tab.location.href = result.url;
}

interface ExpensePageContentProps {
  categories: CategoryRow[];
  entries: ExpenseEntryRow[];
  canManageCategories: boolean;
  canAdjust: boolean;
}

// Phase 9 — Expense. FR-EXP-01/02/03: หมวดหมู่ + รายการค่าใช้จ่าย append-only +
// การแก้ไขทำผ่านรายการปรับปรุงใหม่เท่านั้น สรุปยอดสุทธิต่อหมวดหมู่ (รวม
// รายการปรับปรุง) ให้เห็นผลกระทบต่อกำไร-ขาดทุนทันที ตาม Acceptance Criteria
export function ExpensePageContent({
  categories,
  entries,
  canManageCategories,
  canAdjust,
}: ExpensePageContentProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

  function handleChanged() {
    startTransition(() => router.refresh());
  }

  // Matches description, category, or amount — searching "500" finds every
  // entry near that amount just as readily as typing the category would.
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (categoryFilter !== ALL_CATEGORIES && e.categoryId !== categoryFilter) return false;
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        (e.description ?? "").toLowerCase().includes(term) ||
        e.categoryName.toLowerCase().includes(term) ||
        e.amount.includes(term)
      );
    });
  }, [entries, search, categoryFilter]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, { name: string; net: number }>();
    for (const e of entries) {
      const prev = totals.get(e.categoryId) ?? { name: e.categoryName, net: 0 };
      prev.net += Number(e.amount);
      totals.set(e.categoryId, prev);
    }
    return Array.from(totals.values()).sort((a, b) => b.net - a.net);
  }, [entries]);

  const grandTotal = categoryTotals.reduce((sum, c) => sum + c.net, 0);

  return (
    <div className="space-y-6">
      {canManageCategories && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">หมวดหมู่ค่าใช้จ่าย</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryManager initialCategories={categories} onChanged={handleChanged} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สรุปยอดสุทธิตามหมวดหมู่</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryTotals.length === 0 ? (
            <p className="text-muted-foreground text-sm">ยังไม่มีรายการค่าใช้จ่าย</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>หมวดหมู่</TableHead>
                  <TableHead>ยอดสุทธิ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTotals.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{formatBaht(c.net)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">รวมทั้งหมด</TableCell>
                  <TableCell className="font-semibold">{formatBaht(grandTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">รายการค่าใช้จ่าย</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              ทั้งหมด {filteredEntries.length} รายการ
            </p>
          </div>
          <ExpenseEntryDialog categories={categories} onRecorded={handleChanged} />
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารายละเอียด หมวดหมู่ หรือจำนวนเงิน..."
              className="max-w-xs"
            />
            {categories.length > 0 && (
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v ?? ALL_CATEGORIES)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="ทุกหมวดหมู่">
                    {(v: string) =>
                      v === ALL_CATEGORIES
                        ? "ทุกหมวดหมู่"
                        : (categories.find((c) => c.id === v)?.name ?? "ทุกหมวดหมู่")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>ทุกหมวดหมู่</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">ลำดับ</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>หมวดหมู่</TableHead>
                <TableHead>จำนวนเงิน</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>สลิป</TableHead>
                {canAdjust && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canAdjust ? 8 : 7}
                    className="text-muted-foreground text-center"
                  >
                    ไม่พบรายการ
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((e, index) => {
                  const value = Number(e.amount);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(e.createdAt).toLocaleString("th-TH")}
                      </TableCell>
                      <TableCell>{e.categoryName}</TableCell>
                      <TableCell className={value < 0 ? "text-destructive" : ""}>
                        {value > 0 ? "+" : ""}
                        {formatBaht(value)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        {e.reversalOfId && <Badge variant="secondary">รายการปรับปรุง</Badge>}
                      </TableCell>
                      <TableCell>
                        {e.hasSlip ? (
                          <Button size="sm" variant="outline" onClick={() => handleViewSlip(e.id)}>
                            <Paperclip /> ดูสลิป
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      {canAdjust && (
                        <TableCell>
                          <ExpenseAdjustmentDialog
                            entryId={e.id}
                            categoryName={e.categoryName}
                            amount={e.amount}
                            onAdjusted={handleChanged}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
