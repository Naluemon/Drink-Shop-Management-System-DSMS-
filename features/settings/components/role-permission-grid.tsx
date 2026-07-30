"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateRolePagePermissions,
  resetRolePagePermissionsToDefault,
  type RolePagePermissionRow,
} from "../actions/role-page-permissions";
import { PAGE_KEYS, type PageKey } from "@/lib/page-access";
import { PAGE_KEY_LABELS, ROLE_LABELS } from "@/components/nav-config";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const EDITABLE_ROLES = [
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

type Grid = Record<PageKey, Record<EditableRole, boolean>>;

function buildGrid(rows: RolePagePermissionRow[]): Grid {
  const grid = {} as Grid;
  for (const pageKey of PAGE_KEYS) {
    grid[pageKey] = {} as Grid[PageKey];
    for (const role of EDITABLE_ROLES) {
      grid[pageKey][role] = false;
    }
  }
  for (const row of rows) {
    if (row.role === "owner") continue;
    if ((EDITABLE_ROLES as readonly string[]).includes(row.role)) {
      grid[row.pageKey][row.role as EditableRole] = row.allowed;
    }
  }
  return grid;
}

interface RolePermissionGridProps {
  initialRows: RolePagePermissionRow[];
}

// Owner-only permission grid on /settings — app/settings/page.tsx already
// gates the whole page to owner, so no extra check is needed here.
export function RolePermissionGrid({ initialRows }: RolePermissionGridProps) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => buildGrid(initialRows));
  const [grid, setGrid] = useState(() => buildGrid(initialRows));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = PAGE_KEYS.some((pageKey) =>
    EDITABLE_ROLES.some((role) => grid[pageKey][role] !== baseline[pageKey][role]),
  );

  function toggle(pageKey: PageKey, role: EditableRole) {
    setError(null);
    setSavedAt(null);
    setGrid((prev) => ({
      ...prev,
      [pageKey]: { ...prev[pageKey], [role]: !prev[pageKey][role] },
    }));
  }

  function handleSave() {
    const changes = PAGE_KEYS.flatMap((pageKey) =>
      EDITABLE_ROLES.filter((role) => grid[pageKey][role] !== baseline[pageKey][role]).map(
        (role) => ({ role, pageKey, allowed: grid[pageKey][role] }),
      ),
    );
    if (changes.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await updateRolePagePermissions({ changes });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setBaseline(grid);
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function handleReset() {
    setConfirmResetOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await resetRolePagePermissionsToDefault();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>หน้าเมนู</TableHead>
              <TableHead className="text-center">{ROLE_LABELS.owner}</TableHead>
              {EDITABLE_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PAGE_KEYS.map((pageKey) => (
              <TableRow key={pageKey}>
                <TableCell>{PAGE_KEY_LABELS[pageKey]}</TableCell>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    aria-label={`${ROLE_LABELS.owner} - ${PAGE_KEY_LABELS[pageKey]}`}
                  />
                </TableCell>
                {EDITABLE_ROLES.map((role) => (
                  <TableCell key={role} className="text-center">
                    <input
                      type="checkbox"
                      checked={grid[pageKey][role]}
                      disabled={isPending}
                      onChange={() => toggle(pageKey, role)}
                      aria-label={`${ROLE_LABELS[role]} - ${PAGE_KEY_LABELS[pageKey]}`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" disabled={!isDirty || isPending} onClick={handleSave}>
          บันทึก
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirmResetOpen(true)}
        >
          รีเซ็ตเป็นค่าเริ่มต้น
        </Button>
        {savedAt && <p className="text-accent text-xs">บันทึกสำเร็จ</p>}
      </div>
      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="รีเซ็ตสิทธิ์เป็นค่าเริ่มต้นใช่ไหม?"
        description="การเปลี่ยนแปลงที่ตั้งค่าไว้ทั้งหมดจะถูกล้างกลับไปเป็นค่าเริ่มต้นของระบบ"
        confirmLabel="รีเซ็ต"
        onConfirm={handleReset}
      />
    </div>
  );
}
