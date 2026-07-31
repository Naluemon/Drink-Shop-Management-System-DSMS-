"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/sweet-alert";
import { UserPlus } from "lucide-react";
import { createInvite } from "@/features/auth/actions/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  // DECISIONS.md D14: Owner invite ได้ทุก role, Manager invite ได้เฉพาะ 3 role นี้
  owner: [
    { value: "owner", label: "เจ้าของร้าน (Owner)" },
    { value: "manager", label: "ผู้จัดการ (Manager)" },
    { value: "shift_supervisor", label: "หัวหน้ากะ (Shift Supervisor)" },
    { value: "cashier", label: "แคชเชียร์ (Cashier)" },
    { value: "employee", label: "พนักงาน (Employee)" },
    { value: "accountant", label: "ฝ่ายบัญชี (Accountant)" },
  ],
  manager: [
    { value: "shift_supervisor", label: "หัวหน้ากะ (Shift Supervisor)" },
    { value: "cashier", label: "แคชเชียร์ (Cashier)" },
    { value: "employee", label: "พนักงาน (Employee)" },
  ],
};

interface InviteUserDialogProps {
  actorRole: "owner" | "manager";
  onInvited?: () => void;
}

export function InviteUserDialog({ actorRole, onInvited }: InviteUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleOptions = ROLE_OPTIONS[actorRole];

  function reset() {
    setEmail("");
    setRole("");
    setError(null);
    setInviteLink(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvite({ email, role: role as never });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setInviteLink(result?.inviteLink ?? null);
      toast.success("ส่งคำเชิญสำเร็จ");
      router.refresh();
      onInvited?.();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus /> เชิญผู้ใช้ใหม่
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เชิญผู้ใช้ใหม่</DialogTitle>
          <DialogDescription>
            ผู้ถูกเชิญจะได้รับลิงก์สำหรับตั้งรหัสผ่านของตนเอง (หมดอายุใน 7 วัน)
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              ยังไม่มีระบบส่งอีเมลอัตโนมัติ — คัดลอกลิงก์นี้ไปส่งให้ผู้ถูกเชิญเอง:
            </p>
            <div className="bg-muted rounded-lg p-3 text-xs break-all">{inviteLink}</div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink);
              }}
            >
              คัดลอกลิงก์
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="invite-email">อีเมล</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@shop.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">บทบาท</Label>
              <Select value={role} onValueChange={(v) => setRole(v ?? "")}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue placeholder="เลือกบทบาท">
                    {(v: string) =>
                      roleOptions.find((opt) => opt.value === v)?.label ?? "เลือกบทบาท"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isPending || !role}>
              {isPending ? "กำลังส่งคำเชิญ..." : "ส่งคำเชิญ"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
