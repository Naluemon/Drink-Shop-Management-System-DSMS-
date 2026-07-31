"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { Plus, Pencil } from "lucide-react";
import { createSupplier, updateSupplier } from "../actions/suppliers";
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

export interface SavedSupplierFields {
  id: string;
  name: string;
  contactInfo: string;
}

interface SupplierFormDialogProps {
  mode: "create" | "edit";
  initialValues?: SavedSupplierFields;
  onSaved?: (fields: SavedSupplierFields) => void;
}

// FR-PUR-01: CRUD supplier
export function SupplierFormDialog({ mode, initialValues, onSaved }: SupplierFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [contactInfo, setContactInfo] = useState(initialValues?.contactInfo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, contactInfo };

      let id: string;
      if (mode === "create") {
        const result = await createSupplier(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.supplier!.id;
      } else {
        const result = await updateSupplier(initialValues!.id!, input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = initialValues!.id!;
      }

      onSaved?.({ id, name, contactInfo });
      toast.success(mode === "create" ? "เพิ่มผู้จำหน่ายสำเร็จ" : "แก้ไขผู้จำหน่ายสำเร็จ");

      setOpen(false);
      if (mode === "create") {
        setName("");
        setContactInfo("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={mode === "create" ? <Button /> : <Button variant="outline" size="sm" />}
      >
        {mode === "create" ? (
          <>
            <Plus /> เพิ่มผู้จำหน่าย
          </>
        ) : (
          <>
            <Pencil /> แก้ไข
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "เพิ่มผู้จำหน่ายใหม่" : `แก้ไข ${initialValues?.name}`}
          </DialogTitle>
          <DialogDescription>ข้อมูลผู้จำหน่ายวัตถุดิบ</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="sup-name">ชื่อผู้จำหน่าย</Label>
            <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sup-contact">ข้อมูลติดต่อ (ไม่บังคับ)</Label>
            <Input
              id="sup-contact"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="เบอร์โทร/LINE/อีเมล"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            บันทึก
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
