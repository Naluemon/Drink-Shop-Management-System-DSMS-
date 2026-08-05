"use client";

import { useState, useTransition } from "react";
import { toast, confirmDelete } from "@/lib/sweet-alert";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { createMenuCategory, updateMenuCategory, softDeleteMenuCategory } from "../actions/menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TYPE_LABELS: Record<"food" | "drink", string> = { food: "อาหาร", drink: "เครื่องดื่ม" };

export interface CategoryRow {
  id: string;
  name: string;
  type: "food" | "drink";
}

interface CategoryManagerProps {
  categories: CategoryRow[];
  onCreated: (category: CategoryRow) => void;
  onUpdated: (category: CategoryRow) => void;
  onDeleted: (id: string) => void;
}

// FR-MENU-01: Menu CRUD "พร้อม...หมวดหมู่" — started as create-only ("no
// separate edit/delete UI since categories are just a grouping label"), but
// that left no way to fix a typo or retire a category, so this dialog now
// also lists existing categories with inline rename/delete.
export function CategoryManager({
  categories,
  onCreated,
  onUpdated,
  onDeleted,
}: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"food" | "drink">("drink");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"food" | "drink">("drink");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMenuCategory({ name, type });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.category) {
        onCreated({
          id: result.category.id,
          name: result.category.name,
          type: result.category.type,
        });
        toast.success("เพิ่มหมวดหมู่สำเร็จ");
      }
      setName("");
      setType("drink");
    });
  }

  function startEdit(c: CategoryRow) {
    setError(null);
    setEditingId(c.id);
    setEditName(c.name);
    setEditType(c.type);
  }

  function handleSaveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateMenuCategory(id, { name: editName, type: editType });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onUpdated({ id, name: editName, type: editType });
      setEditingId(null);
      toast.success("แก้ไขหมวดหมู่สำเร็จ");
    });
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirmDelete({
      title: `ลบหมวดหมู่ "${name}" ใช่ไหม?`,
      description: 'เมนูที่เคยอยู่หมวดหมู่นี้จะกลายเป็น "ไม่มีหมวดหมู่" กู้คืนได้ภายหลังหากจำเป็น',
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await softDeleteMenuCategory(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      onDeleted(id);
      toast.success("ลบหมวดหมู่สำเร็จ");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus /> จัดการหมวดหมู่
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>หมวดหมู่เมนู</DialogTitle>
          <DialogDescription>เช่น เครื่องดื่มร้อน, เครื่องดื่มเย็น, ของทานเล่น</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {categories.length > 0 && (
            <ul className="space-y-1">
              {categories.map((c) =>
                editingId === c.id ? (
                  <li key={c.id} className="flex items-end gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <Select
                      value={editType}
                      onValueChange={(v) => v && setEditType(v as "food" | "drink")}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue>
                          {(v: string) => TYPE_LABELS[v as "food" | "drink"]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drink">{TYPE_LABELS.drink}</SelectItem>
                        <SelectItem value="food">{TYPE_LABELS.food}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending || !editName}
                      onClick={() => handleSaveEdit(c.id)}
                    >
                      บันทึก
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      ยกเลิก
                    </button>
                  </li>
                ) : (
                  <li
                    key={c.id}
                    className="bg-muted/30 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                  >
                    <span>
                      {c.name}{" "}
                      <span className="text-muted-foreground text-xs">({TYPE_LABELS[c.type]})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="แก้ไขหมวดหมู่นี้"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.name)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="ลบหมวดหมู่นี้"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}

          {/* Adding a new category is still its own small form, separate
              from the edit-in-place rows above */}
          <form onSubmit={handleAdd} className="flex items-end gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เครื่องดื่มเย็น"
              className="flex-1"
              required
            />
            <Select value={type} onValueChange={(v) => v && setType(v as "food" | "drink")}>
              <SelectTrigger className="w-28">
                <SelectValue>{(v: string) => TYPE_LABELS[v as "food" | "drink"]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drink">{TYPE_LABELS.drink}</SelectItem>
                <SelectItem value="food">{TYPE_LABELS.food}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={isPending}>
              เพิ่ม
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
