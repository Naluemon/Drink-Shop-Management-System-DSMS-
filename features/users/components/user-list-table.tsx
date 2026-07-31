"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { toggleUserActive, updateUserRole } from "@/features/users/actions/manage-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

const ROLE_LABELS: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  shift_supervisor: "หัวหน้ากะ",
  cashier: "แคชเชียร์",
  employee: "พนักงาน",
  accountant: "ฝ่ายบัญชี",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface UserListTableProps {
  initialUsers: UserRow[];
  currentUserId: string;
}

export function UserListTable({ initialUsers, currentUserId }: UserListTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    userId: string;
    userName: string;
    oldRole: string;
    newRole: string;
  } | null>(null);

  function handleToggle(userId: string) {
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await toggleUserActive(userId);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        const wasActive = users.find((u) => u.id === userId)?.isActive;
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u)),
        );
        toast.success(wasActive ? "ระงับผู้ใช้สำเร็จ" : "เปิดใช้งานผู้ใช้สำเร็จ");
      }
      setPendingId(null);
    });
  }

  function handleRoleSelect(user: UserRow, newRole: string) {
    if (newRole === user.role) return;
    setPendingRoleChange({ userId: user.id, userName: user.fullName, oldRole: user.role, newRole });
  }

  function commitRoleChange() {
    if (!pendingRoleChange) return;
    const { userId, newRole } = pendingRoleChange;
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
        toast.success("เปลี่ยนบทบาทสำเร็จ");
      }
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}
      <p className="text-muted-foreground text-sm">ทั้งหมด {users.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อ-นามสกุล</TableHead>
            <TableHead>อีเมล</TableHead>
            <TableHead>บทบาท</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u, index) => (
            <TableRow key={u.id}>
              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-medium">{u.fullName}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                {u.id === currentUserId ? (
                  (ROLE_LABELS[u.role] ?? u.role)
                ) : (
                  <Select
                    value={u.role}
                    onValueChange={(v) => v && handleRoleSelect(u, v)}
                    disabled={pendingId === u.id}
                  >
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue>{(v: string) => ROLE_LABELS[v] ?? v}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? "default" : "outline"}>
                  {u.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {u.id === currentUserId ? (
                  <span className="text-muted-foreground text-xs">คุณ</span>
                ) : (
                  <Button
                    size="sm"
                    variant={u.isActive ? "destructive" : "outline"}
                    disabled={pendingId === u.id}
                    onClick={() => handleToggle(u.id)}
                  >
                    {u.isActive ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!pendingRoleChange}
        onOpenChange={(open) => !open && setPendingRoleChange(null)}
        title="เปลี่ยนบทบาทผู้ใช้นี้ใช่ไหม?"
        description={
          pendingRoleChange
            ? `เปลี่ยนบทบาทของ "${pendingRoleChange.userName}" จาก "${ROLE_LABELS[pendingRoleChange.oldRole] ?? pendingRoleChange.oldRole}" เป็น "${ROLE_LABELS[pendingRoleChange.newRole] ?? pendingRoleChange.newRole}" — มีผลกับสิทธิ์การเข้าถึงทันที`
            : ""
        }
        confirmLabel="เปลี่ยนบทบาท"
        onConfirm={commitRoleChange}
      />
    </div>
  );
}
