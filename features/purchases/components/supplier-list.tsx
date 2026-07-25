"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { softDeleteSupplier } from "../actions/suppliers";
import { SupplierFormDialog, type SavedSupplierFields } from "./supplier-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface SupplierRow {
  id: string;
  name: string;
  contactInfo: string | null;
}

interface SupplierListProps {
  initialSuppliers: SupplierRow[];
  canEdit: boolean;
}

export function SupplierList({ initialSuppliers, canEdit }: SupplierListProps) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(term) || (s.contactInfo ?? "").toLowerCase().includes(term),
    );
  }, [suppliers, search]);

  function handleCreated(fields: SavedSupplierFields) {
    setSuppliers((prev) =>
      [...prev, { id: fields.id, name: fields.name, contactInfo: fields.contactInfo || null }].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    );
  }

  function handleUpdated(fields: SavedSupplierFields) {
    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === fields.id
          ? { ...s, name: fields.name, contactInfo: fields.contactInfo || null }
          : s,
      ),
    );
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteSupplier(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      toast.success("ลบผู้จำหน่ายสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ หรือข้อมูลติดต่อ..."
          className="max-w-xs"
        />
        {canEdit && <SupplierFormDialog mode="create" onSaved={handleCreated} />}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อผู้จำหน่าย</TableHead>
            <TableHead>ข้อมูลติดต่อ</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 4 : 3} className="text-muted-foreground text-center">
                ไม่พบผู้จำหน่าย
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((s, index) => (
              <TableRow key={s.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.contactInfo ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <SupplierFormDialog
                        mode="edit"
                        onSaved={handleUpdated}
                        initialValues={{ id: s.id, name: s.name, contactInfo: s.contactInfo ?? "" }}
                      />
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive" disabled={isPending} />}
                        triggerLabel="ลบ"
                        title={`ลบผู้จำหน่าย "${s.name}" ใช่ไหม?`}
                        description="ผู้จำหน่ายนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น"
                        confirmLabel="ลบ"
                        onConfirm={() => handleDelete(s.id)}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
