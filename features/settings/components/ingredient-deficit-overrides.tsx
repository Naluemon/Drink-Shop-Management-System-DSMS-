"use client";

import { useState, useTransition } from "react";
import { updateIngredientDeficitOverride } from "../actions/company-settings";
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

export interface IngredientOverrideRow {
  id: string;
  name: string;
  stockDeficitPolicyOverride: "warn_only" | "strict_block" | null;
}

interface IngredientDeficitOverridesProps {
  ingredients: IngredientOverrideRow[];
}

const OVERRIDE_LABELS: Record<string, string> = {
  default: "ตามค่าเริ่มต้นร้าน",
  warn_only: "เตือนเท่านั้น",
  strict_block: "บล็อกเข้มงวด",
};

// FR-SET-04 / DECISIONS.md D4: per-ingredient override of the global stock
// deficit policy — null override means "follow CompanySettings.stockDeficitPolicy"
export function IngredientDeficitOverrides({ ingredients }: IngredientDeficitOverridesProps) {
  const [rows, setRows] = useState(ingredients);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(ingredientId: string, value: string) {
    setError(null);
    const override = value as "warn_only" | "strict_block" | "default";
    startTransition(async () => {
      const result = await updateIngredientDeficitOverride({ ingredientId, override });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === ingredientId
            ? { ...r, stockDeficitPolicyOverride: override === "default" ? null : override }
            : r,
        ),
      );
    });
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">ยังไม่มีวัตถุดิบในระบบ</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-destructive text-xs">{error}</p>}
      <p className="text-muted-foreground text-sm">ทั้งหมด {rows.length} รายการ</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>วัตถุดิบ</TableHead>
            <TableHead>นโยบายสต็อกไม่พอ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, index) => {
            const value = r.stockDeficitPolicyOverride ?? "default";
            return (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <Select value={value} onValueChange={(v) => handleChange(r.id, v ?? "default")}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="เลือกนโยบาย">
                        {(v: string) => OVERRIDE_LABELS[v] ?? v}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{OVERRIDE_LABELS.default}</SelectItem>
                      <SelectItem value="warn_only">{OVERRIDE_LABELS.warn_only}</SelectItem>
                      <SelectItem value="strict_block">{OVERRIDE_LABELS.strict_block}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
