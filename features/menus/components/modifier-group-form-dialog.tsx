"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { createModifierGroup, updateModifierGroup } from "../actions/modifier-groups";
import { ModifierManager, type ModifierRow, type IngredientOption } from "./modifier-manager";
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

const SELECTION_TYPE_LABELS: Record<string, string> = {
  single: "เลือกได้ 1 ตัวเลือก",
  multiple: "เลือกได้หลายตัวเลือก",
};

export interface ModifierGroupFormValues {
  id?: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  modifiers: ModifierRow[];
}

export interface SavedModifierGroupFields {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
}

interface ModifierGroupFormDialogProps {
  mode: "create" | "edit";
  initialValues?: ModifierGroupFormValues;
  availableIngredients: IngredientOption[];
  onSaved?: (fields: SavedModifierGroupFields) => void;
  onModifiersChange?: (rows: ModifierRow[]) => void;
}

// FR-MENU-04/05: modifier_group (Topping, ความหวาน) + modifier ในกลุ่ม
export function ModifierGroupFormDialog({
  mode,
  initialValues,
  availableIngredients,
  onSaved,
  onModifiersChange,
}: ModifierGroupFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [selectionType, setSelectionType] = useState(initialValues?.selectionType ?? "single");
  const [isRequired, setIsRequired] = useState(initialValues?.isRequired ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, selectionType: selectionType as never, isRequired };

      let id: string;
      if (mode === "create") {
        const result = await createModifierGroup(input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = result.group!.id;
      } else {
        const result = await updateModifierGroup(initialValues!.id!, input);
        if (result?.error) {
          setError(result.error);
          return;
        }
        id = initialValues!.id!;
      }

      onSaved?.({ id, name, selectionType, isRequired });
      toast.success(mode === "create" ? "เพิ่มกลุ่มตัวเลือกสำเร็จ" : "แก้ไขกลุ่มตัวเลือกสำเร็จ");

      if (mode === "create") {
        setOpen(false);
        setName("");
        setSelectionType("single");
        setIsRequired(false);
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
            <Plus /> เพิ่มกลุ่มตัวเลือก
          </>
        ) : (
          <>
            <Pencil /> แก้ไข
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "เพิ่มกลุ่มตัวเลือกใหม่" : `แก้ไข ${initialValues?.name}`}
          </DialogTitle>
          <DialogDescription>เช่น &quot;Topping&quot;, &quot;ระดับความหวาน&quot;</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="mg-name">ชื่อกลุ่ม</Label>
            <Input
              id="mg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Topping"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mg-selection">รูปแบบการเลือก</Label>
            <Select value={selectionType} onValueChange={(v) => setSelectionType(v ?? "single")}>
              <SelectTrigger id="mg-selection" className="w-full">
                <SelectValue>{(v: string) => SELECTION_TYPE_LABELS[v] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">เลือกได้ 1 ตัวเลือก</SelectItem>
                <SelectItem value="multiple">เลือกได้หลายตัวเลือก</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="text-primary border-input focus:ring-ring size-4 rounded"
            />
            บังคับให้ลูกค้าเลือกก่อนสั่งซื้อ
          </label>

          {mode === "edit" && initialValues?.id && (
            <ModifierManager
              modifierGroupId={initialValues.id}
              initialModifiers={initialValues.modifiers}
              availableIngredients={availableIngredients}
              onModifiersChange={onModifiersChange}
            />
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
