"use client";

import { useState } from "react";
import { PrivacyNotice } from "./privacy-notice";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";

interface InviteAcceptFormProps {
  action: (formData: FormData) => void | Promise<void>;
}

// DECISIONS.md D15: ต้องแสดง Privacy Notice ก่อนตั้งรหัสผ่านครั้งแรกเสมอ
export function InviteAcceptForm({ action }: InviteAcceptFormProps) {
  const [pdpaAccepted, setPdpaAccepted] = useState(false);

  if (!pdpaAccepted) {
    return <PrivacyNotice onAccept={() => setPdpaAccepted(true)} />;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="acceptPdpa" value="true" />
      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
        />
        <p className="text-xs text-slate-500">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          required
          minLength={8}
          className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
        />
      </div>
      <Button
        className="h-11 w-full text-base font-medium shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
        type="submit"
      >
        สร้างบัญชี
      </Button>
    </form>
  );
}
