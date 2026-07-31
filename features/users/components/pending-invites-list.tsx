"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { cancelInvite } from "@/features/auth/actions/invite";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

export interface PendingInviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedByName: string;
  inviteLink: string;
}

interface PendingInvitesListProps {
  initialInvites: PendingInviteRow[];
  showInviter: boolean;
}

function daysRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  return days <= 0 ? "หมดอายุวันนี้" : `เหลือ ${days} วัน`;
}

// FR-USR: กู้คืน/ยกเลิกคำเชิญที่ยังไม่หมดอายุ — เดิมลิงก์เชิญโชว์ครั้งเดียวตอน
// สร้างเท่านั้น ถ้าปิด dialog ไปโดยยังไม่ได้คัดลอกก็ไม่มีทางกู้คืนได้ ต้องรอ 7 วัน
// ให้หมดอายุก่อนถึงจะเชิญอีเมลเดิมใหม่ได้ — รายการนี้ให้คัดลอกลิงก์ซ้ำหรือยกเลิก
// เพื่อเชิญใหม่ได้ทันที
export function PendingInvitesList({ initialInvites, showInviter }: PendingInvitesListProps) {
  const [invites, setInvites] = useState(initialInvites);
  const [prevInitialInvites, setPrevInitialInvites] = useState(initialInvites);
  if (initialInvites !== prevInitialInvites) {
    setPrevInitialInvites(initialInvites);
    setInvites(initialInvites);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PendingInviteRow | null>(null);
  const [, startTransition] = useTransition();

  function handleCopy(inviteLink: string) {
    navigator.clipboard.writeText(inviteLink);
    toast.success("คัดลอกลิงก์แล้ว");
  }

  function commitCancel() {
    if (!cancelTarget) return;
    const { id } = cancelTarget;
    setPendingId(id);
    startTransition(async () => {
      const result = await cancelInvite(id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setInvites((prev) => prev.filter((invite) => invite.id !== id));
        toast.success("ยกเลิกคำเชิญสำเร็จ");
      }
      setPendingId(null);
      setCancelTarget(null);
    });
  }

  if (invites.length === 0) {
    return <p className="text-muted-foreground text-sm">ไม่มีคำเชิญที่รอดำเนินการ</p>;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>อีเมล</TableHead>
            <TableHead>บทบาท</TableHead>
            {showInviter && <TableHead>ผู้เชิญ</TableHead>}
            <TableHead>อายุคำเชิญ</TableHead>
            <TableHead className="text-right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((invite) => (
            <TableRow key={invite.id}>
              <TableCell className="font-medium">{invite.email}</TableCell>
              <TableCell>{ROLE_LABELS[invite.role] ?? invite.role}</TableCell>
              {showInviter && (
                <TableCell className="text-muted-foreground">{invite.invitedByName}</TableCell>
              )}
              <TableCell className="text-muted-foreground">
                {daysRemaining(invite.expiresAt)}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === invite.id}
                  onClick={() => handleCopy(invite.inviteLink)}
                >
                  คัดลอกลิงก์
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pendingId === invite.id}
                  onClick={() => setCancelTarget(invite)}
                >
                  ยกเลิก
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="ยกเลิกคำเชิญนี้ใช่ไหม?"
        description={
          cancelTarget
            ? `ยกเลิกคำเชิญของ "${cancelTarget.email}" — ลิงก์เดิมจะใช้ไม่ได้ทันที และสามารถเชิญอีเมลนี้ใหม่ได้เลยโดยไม่ต้องรอ`
            : ""
        }
        confirmLabel="ยกเลิกคำเชิญ"
        onConfirm={commitCancel}
      />
    </div>
  );
}
