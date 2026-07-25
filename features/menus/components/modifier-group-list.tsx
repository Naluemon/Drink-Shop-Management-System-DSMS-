"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { softDeleteModifierGroup } from "../actions/modifier-groups";
import {
  ModifierGroupFormDialog,
  type ModifierGroupFormValues,
  type SavedModifierGroupFields,
} from "./modifier-group-form-dialog";
import type { ModifierRow, IngredientOption } from "./modifier-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ModifierGroupRow {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  modifiers: ModifierRow[];
}

interface ModifierGroupListProps {
  initialGroups: ModifierGroupRow[];
  availableIngredients: IngredientOption[];
  canEdit: boolean;
}

const SELECTION_TYPE_LABELS: Record<string, string> = {
  single: "เลือก 1",
  multiple: "เลือกได้หลาย",
};

export function ModifierGroupList({
  initialGroups,
  availableIngredients,
  canEdit,
}: ModifierGroupListProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(term));
  }, [groups, search]);

  function handleCreated(fields: SavedModifierGroupFields) {
    setGroups((prev) => [...prev, { ...fields, modifiers: [] }]);
  }

  function handleUpdated(fields: SavedModifierGroupFields) {
    setGroups((prev) => prev.map((g) => (g.id === fields.id ? { ...g, ...fields } : g)));
  }

  function handleModifiersChange(groupId: string, modifiers: ModifierRow[]) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, modifiers } : g)));
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteModifierGroup(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast.success("ลบกลุ่มตัวเลือกสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อกลุ่มตัวเลือก..."
          className="max-w-xs"
        />
        {canEdit && (
          <ModifierGroupFormDialog
            availableIngredients={availableIngredients}
            mode="create"
            onSaved={handleCreated}
          />
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <p className="text-muted-foreground text-sm">ทั้งหมด {filtered.length} รายการ</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">ลำดับ</TableHead>
            <TableHead>ชื่อกลุ่ม</TableHead>
            <TableHead>รูปแบบ</TableHead>
            <TableHead>บังคับเลือก</TableHead>
            <TableHead>จำนวนตัวเลือก</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 6 : 5} className="text-muted-foreground text-center">
                ไม่พบกลุ่มตัวเลือก
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((g, index) => (
              <TableRow key={g.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>{SELECTION_TYPE_LABELS[g.selectionType] ?? g.selectionType}</TableCell>
                <TableCell>
                  {g.isRequired ? (
                    <Badge>บังคับ</Badge>
                  ) : (
                    <Badge variant="outline">ไม่บังคับ</Badge>
                  )}
                </TableCell>
                <TableCell>{g.modifiers.length} ตัวเลือก</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <ModifierGroupFormDialog
                        mode="edit"
                        availableIngredients={availableIngredients}
                        onSaved={handleUpdated}
                        onModifiersChange={(rows) => handleModifiersChange(g.id, rows)}
                        initialValues={
                          {
                            id: g.id,
                            name: g.name,
                            selectionType: g.selectionType,
                            isRequired: g.isRequired,
                            modifiers: g.modifiers,
                          } satisfies ModifierGroupFormValues
                        }
                      />
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive" disabled={isPending} />}
                        triggerLabel="ลบ"
                        title={`ลบกลุ่มตัวเลือก "${g.name}" ใช่ไหม?`}
                        description="กลุ่มตัวเลือกนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น"
                        confirmLabel="ลบ"
                        onConfirm={() => handleDelete(g.id)}
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
