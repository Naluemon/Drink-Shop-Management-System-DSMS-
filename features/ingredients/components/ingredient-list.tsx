"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { softDeleteIngredient } from "../actions/ingredients";
import {
  IngredientFormDialog,
  type IngredientFormValues,
  type SavedIngredientFields,
} from "./ingredient-form-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatNumber } from "@/lib/utils";
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

const BASE_UNIT_LABELS: Record<string, string> = { gram: "กรัม", ml: "มล.", piece: "ชิ้น" };

export interface IngredientRow {
  id: string;
  name: string;
  baseUnit: string;
  costPerUnit: string;
  currentStockQty: string;
  lowStockThreshold: string | null;
  supplierId: string | null;
  supplierName: string | null;
  unitConversions: { id: string; purchaseUnitName: string; conversionFactor: string }[];
}

interface SupplierOption {
  id: string;
  name: string;
}

interface IngredientListProps {
  initialIngredients: IngredientRow[];
  suppliers: SupplierOption[];
  canEdit: boolean;
}

// FR-ING-01: Search/Filter ตามชื่อ + supplier (ไม่มี "หมวดหมู่" เพราะ schema
// ไม่มีคอลัมน์นี้ — ดูหมายเหตุใน features/ingredients/actions/ingredients.ts)
export function IngredientList({ initialIngredients, suppliers, canEdit }: IngredientListProps) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      const term = search.trim().toLowerCase();
      const matchesSearch = term
        ? i.name.toLowerCase().includes(term) ||
          (i.supplierName ?? "").toLowerCase().includes(term) ||
          i.costPerUnit.includes(term)
        : true;
      const matchesSupplier = supplierFilter ? i.supplierId === supplierFilter : true;
      return matchesSearch && matchesSupplier;
    });
  }, [ingredients, search, supplierFilter]);

  function toRow(fields: SavedIngredientFields, existing?: IngredientRow): IngredientRow {
    return {
      id: fields.id,
      name: fields.name,
      baseUnit: fields.baseUnit,
      costPerUnit: fields.costPerUnit,
      currentStockQty: existing?.currentStockQty ?? "0",
      lowStockThreshold: fields.lowStockThreshold === "" ? null : fields.lowStockThreshold,
      supplierId: fields.supplierId || null,
      supplierName: suppliers.find((s) => s.id === fields.supplierId)?.name ?? null,
      unitConversions: existing?.unitConversions ?? [],
    };
  }

  function handleCreated(fields: SavedIngredientFields) {
    setIngredients((prev) => [...prev, toRow(fields)].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleUpdated(fields: SavedIngredientFields) {
    setIngredients((prev) => prev.map((i) => (i.id === fields.id ? toRow(fields, i) : i)));
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteIngredient(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      toast.success("ลบวัตถุดิบสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ ผู้จำหน่าย หรือต้นทุน..."
            className="max-w-xs"
          />
          {suppliers.length > 0 && (
            <Select value={supplierFilter} onValueChange={(v) => setSupplierFilter(v ?? "")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="ทุกผู้จำหน่าย">
                  {(v: string) => suppliers.find((s) => s.id === v)?.name ?? "ทุกผู้จำหน่าย"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">ทุกผู้จำหน่าย</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {canEdit && (
          <IngredientFormDialog mode="create" suppliers={suppliers} onSaved={handleCreated} />
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อวัตถุดิบ</TableHead>
            <TableHead>หน่วยฐาน</TableHead>
            <TableHead>ต้นทุน/หน่วย</TableHead>
            <TableHead>สต็อกคงเหลือ</TableHead>
            <TableHead>ผู้จำหน่าย</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 7 : 6} className="text-muted-foreground text-center">
                ไม่พบวัตถุดิบ
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((i, index) => (
              <TableRow key={i.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell>{BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit}</TableCell>
                <TableCell>
                  {formatNumber(Number(i.costPerUnit), 4)} บาท/
                  {BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit}
                </TableCell>
                <TableCell>
                  {formatNumber(Number(i.currentStockQty))}{" "}
                  {BASE_UNIT_LABELS[i.baseUnit] ?? i.baseUnit}
                  {i.lowStockThreshold &&
                    Number(i.currentStockQty) <= Number(i.lowStockThreshold) && (
                      <span className="text-destructive ml-1 text-xs">(ใกล้หมด)</span>
                    )}
                </TableCell>
                <TableCell className="text-muted-foreground">{i.supplierName ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <IngredientFormDialog
                        mode="edit"
                        suppliers={suppliers}
                        onSaved={handleUpdated}
                        initialValues={
                          {
                            id: i.id,
                            name: i.name,
                            baseUnit: i.baseUnit,
                            costPerUnit: i.costPerUnit,
                            lowStockThreshold: i.lowStockThreshold ?? "",
                            supplierId: i.supplierId ?? "",
                            unitConversions: i.unitConversions,
                          } satisfies IngredientFormValues
                        }
                      />
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive" disabled={isPending} />}
                        triggerLabel="ลบ"
                        title={`ลบ "${i.name}" ใช่ไหม?`}
                        description="วัตถุดิบนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น"
                        confirmLabel="ลบ"
                        onConfirm={() => handleDelete(i.id)}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
