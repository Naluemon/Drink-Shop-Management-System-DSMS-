"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/sweet-alert";
import { Trash2 } from "lucide-react";
import {
  createExpenseCategory,
  updateExpenseCategory,
  softDeleteExpenseCategory,
} from "../actions/expense";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CategoryRow {
  id: string;
  name: string;
}

interface CategoryManagerProps {
  initialCategories: CategoryRow[];
  onChanged?: () => void;
}

// FR-EXP-01: CRUD หมวดหมู่ค่าใช้จ่าย — จำกัด update/delete ให้ Owner เท่านั้น
// (ผ่าน requirePermission ใน server action, ไม่ใช่แค่ UI-level)
export function CategoryManager({ initialCategories, onChanged }: CategoryManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createExpenseCategory({ name });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.category) {
        setCategories((prev) => [...prev, { id: result.category.id, name: result.category.name }]);
        onChanged?.();
        toast.success("เพิ่มหมวดหมู่สำเร็จ");
      }
      setName("");
    });
  }

  function handleRename(id: string) {
    if (!editingName) return;
    setError(null);
    startTransition(async () => {
      const result = await updateExpenseCategory(id, { name: editingName });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: editingName } : c)));
      setEditingId(null);
      onChanged?.();
      toast.success("แก้ไขหมวดหมู่สำเร็จ");
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteExpenseCategory(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      onChanged?.();
      toast.success("ลบหมวดหมู่สำเร็จ");
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-destructive text-xs">{error}</p>}
      {categories.length > 0 && (
        <ul className="space-y-1">
          {categories.map((c) => (
            <li
              key={c.id}
              className="bg-muted/30 flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm"
            >
              {editingId === c.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => handleRename(c.id)}
                  className="h-7"
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                >
                  {c.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="ลบหมวดหมู่นี้"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="flex items-end gap-2"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label className="text-xs">หมวดหมู่ใหม่</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ค่าน้ำ" />
        </div>
        <Button type="button" size="sm" disabled={isPending || !name} onClick={handleAdd}>
          เพิ่ม
        </Button>
      </div>
    </div>
  );
}
