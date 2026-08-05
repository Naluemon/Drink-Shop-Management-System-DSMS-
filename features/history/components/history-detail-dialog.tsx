"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AuditLogRow } from "../actions/history";

const ACTION_LABELS: Record<AuditLogRow["action"], string> = {
  created: "เพิ่ม",
  updated: "แก้ไข",
  deleted: "ลบ",
};

function formatValue(v: string | number | boolean | null): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  return String(v);
}

// Field names are stored as raw object keys (e.g. "costPerUnit") — no
// translation table exists per-entity yet, so this renders the raw key.
// Good enough for an Owner-only technical audit trail; revisit if that reads
// as too raw in practice.
export function HistoryDetailDialog({ log }: { log: AuditLogRow }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>ดูรายละเอียด</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABELS[log.action]} — {log.entityName}
          </DialogTitle>
        </DialogHeader>
        {log.changes && log.changes.length > 0 ? (
          <ul className="space-y-2">
            {log.changes.map((c) => (
              <li key={c.field} className="bg-muted/30 rounded-md px-3 py-2 text-sm">
                <div className="text-muted-foreground text-xs">{c.field}</div>
                {log.action === "created" ? (
                  <div>{formatValue(c.newValue)}</div>
                ) : (
                  <div>
                    {formatValue(c.oldValue)} <span className="text-muted-foreground">→</span>{" "}
                    {formatValue(c.newValue)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">ไม่มีรายละเอียดเพิ่มเติม</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
