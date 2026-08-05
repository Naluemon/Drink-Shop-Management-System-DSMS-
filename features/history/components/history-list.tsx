"use client";

import { useState, useTransition } from "react";
import { listAuditLogs, type AuditLogRow } from "../actions/history";
import { HistoryDetailDialog } from "./history-detail-dialog";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
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

const ACTION_LABELS: Record<AuditLogRow["action"], string> = {
  created: "เพิ่ม",
  updated: "แก้ไข",
  deleted: "ลบ",
};

const ALL_ACTIONS = "__all__";
const ALL_ENTITY_TYPES = "__all__";

interface HistoryListProps {
  initialLogs: AuditLogRow[];
  initialTotalPages: number;
  entityTypeOptions: { value: string; label: string }[];
}

// Server-side filtered/paginated (unlike IngredientList's client-side
// filtering) — audit logs (POS sales included in a later wave) can grow far
// larger than a client-side full-table fetch should handle.
export function HistoryList({
  initialLogs,
  initialTotalPages,
  entityTypeOptions,
}: HistoryListProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(ALL_ACTIONS);
  const [entityType, setEntityType] = useState(ALL_ENTITY_TYPES);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextPage: number) {
    setError(null);
    startTransition(async () => {
      const result = await listAuditLogs({
        page: nextPage,
        search: search || undefined,
        action: action === ALL_ACTIONS ? undefined : (action as AuditLogRow["action"]),
        entityType: entityType === ALL_ENTITY_TYPES ? undefined : entityType,
      });
      if ("error" in result) {
        setError(result.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setLogs(result.logs);
      setTotalPages(result.totalPages);
      setPage(nextPage);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อรายการ..."
        />
        <Select value={action} onValueChange={(v) => setAction(v ?? ALL_ACTIONS)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="ทุกการกระทำ">
              {(v: string) =>
                v === ALL_ACTIONS ? "ทุกการกระทำ" : ACTION_LABELS[v as AuditLogRow["action"]]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>ทุกการกระทำ</SelectItem>
            <SelectItem value="created">เพิ่ม</SelectItem>
            <SelectItem value="updated">แก้ไข</SelectItem>
            <SelectItem value="deleted">ลบ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={(v) => setEntityType(v ?? ALL_ENTITY_TYPES)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="ทุกประเภทข้อมูล">
              {(v: string) =>
                v === ALL_ENTITY_TYPES
                  ? "ทุกประเภทข้อมูล"
                  : (entityTypeOptions.find((o) => o.value === v)?.label ?? "ทุกประเภทข้อมูล")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ENTITY_TYPES}>ทุกประเภทข้อมูล</SelectItem>
            {entityTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => refetch(1)}>
          ค้นหา
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่/เวลา</TableHead>
            <TableHead>ผู้ทำรายการ</TableHead>
            <TableHead>การกระทำ</TableHead>
            <TableHead>ประเภทข้อมูล</TableHead>
            <TableHead>ชื่อรายการ</TableHead>
            <TableHead className="text-right">รายละเอียด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                ไม่พบประวัติ
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("th-TH")}
                </TableCell>
                <TableCell>{log.actorName}</TableCell>
                <TableCell>{ACTION_LABELS[log.action]}</TableCell>
                <TableCell>
                  {entityTypeOptions.find((o) => o.value === log.entityType)?.label ??
                    log.entityType}
                </TableCell>
                <TableCell className="font-medium">{log.entityName}</TableCell>
                <TableCell className="text-right">
                  <HistoryDetailDialog log={log} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          หน้า {page} จาก {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || page <= 1}
            onClick={() => refetch(page - 1)}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || page >= totalPages}
            onClick={() => refetch(page + 1)}
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
