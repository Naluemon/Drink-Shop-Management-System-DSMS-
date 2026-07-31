"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { createReasonCode, updateReasonCode, softDeleteReasonCode } from "../actions/reason-codes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ReasonCodeRow {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

interface ReasonCodeManagerProps {
  initialCodes: ReasonCodeRow[];
}

// FR-SET-05 / DECISIONS.md D12 review trigger: configurable reason-code
// master list for stock-out — soft-delete only (historical movements may
// still reference a retired code), so "ปิดใช้งาน" (isActive=false) is the
// normal way to retire one; delete is for entries created by mistake.
export function ReasonCodeManager({ initialCodes }: ReasonCodeManagerProps) {
  const [codes, setCodes] = useState(initialCodes);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!code || !label) return;
    setError(null);
    startTransition(async () => {
      const result = await createReasonCode({ code, label });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result?.code) {
        setCodes((prev) => [...prev, result.code]);
      }
      setCode("");
      setLabel("");
      toast.success("เพิ่มเหตุผลสำเร็จ");
    });
  }

  function handleToggleActive(row: ReasonCodeRow) {
    setError(null);
    startTransition(async () => {
      const result = await updateReasonCode(row.id, { label: row.label, isActive: !row.isActive });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, isActive: !c.isActive } : c)));
      toast.success(row.isActive ? "ปิดใช้งานสำเร็จ" : "เปิดใช้งานสำเร็จ");
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteReasonCode(id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCodes((prev) => prev.filter((c) => c.id !== id));
      toast.success("ลบสำเร็จ");
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-destructive text-xs">{error}</p>}
      {codes.length > 0 && (
        <ul className="space-y-1">
          {codes.map((c) => (
            <li
              key={c.id}
              className="bg-muted/30 flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-xs">{c.code}</span>
                {c.label}
                {!c.isActive && <Badge variant="secondary">ปิดใช้งาน</Badge>}
              </span>
              <span className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleToggleActive(c)}
                >
                  {c.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={() => handleDelete(c.id)}
                >
                  ลบ
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        className="flex items-end gap-2"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
      >
        <div className="w-40 space-y-1">
          <Label className="text-xs">รหัส (อังกฤษ)</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="near_expiry" />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">ชื่อที่แสดง</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ใกล้หมดอายุ"
          />
        </div>
        <Button type="button" size="sm" disabled={isPending || !code || !label} onClick={handleAdd}>
          เพิ่ม
        </Button>
      </div>
    </div>
  );
}
