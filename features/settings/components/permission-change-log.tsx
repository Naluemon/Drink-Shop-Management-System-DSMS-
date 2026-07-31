import { listPermissionChangeLog } from "../actions/role-page-permissions";
import { PAGE_KEY_LABELS, ROLE_LABELS } from "@/components/nav-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";

// Async Server Component (like MovementLedger) — rendered directly in
// app/users/page.tsx, not nested inside a "use client" component, since a
// client component can't await a server one.
export async function PermissionChangeLog({ page }: { page: number }) {
  const result = await listPermissionChangeLog(page);
  if ("error" in result) {
    return <p className="text-destructive text-sm">{result.error}</p>;
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่เปลี่ยนแปลง</TableHead>
            <TableHead>ผู้ดำเนินการ</TableHead>
            <TableHead>ตำแหน่ง</TableHead>
            <TableHead>หน้าเมนู</TableHead>
            <TableHead>สถานะการเข้าถึง</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                ยังไม่มีการเปลี่ยนแปลง
              </TableCell>
            </TableRow>
          ) : (
            result.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(entry.changedAt).toLocaleString("th-TH")}
                </TableCell>
                <TableCell>{entry.changedByName}</TableCell>
                <TableCell>{ROLE_LABELS[entry.role] ?? entry.role}</TableCell>
                <TableCell>{PAGE_KEY_LABELS[entry.pageKey] ?? entry.pageKey}</TableCell>
                <TableCell>
                  <Badge variant={entry.allowed ? "default" : "secondary"}>
                    {entry.allowed ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <PaginationControls
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        basePath="/users"
      />
    </div>
  );
}
