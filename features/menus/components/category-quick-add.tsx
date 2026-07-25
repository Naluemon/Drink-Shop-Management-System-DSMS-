"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createMenuCategory } from "../actions/menus";
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

interface CategoryQuickAddProps {
  onCreated: (category: { id: string; name: string; type: "food" | "drink" }) => void;
}

// FR-MENU-01: Menu CRUD "พร้อม...หมวดหมู่" — minimal category creation,
// no separate edit/delete UI since categories are just a grouping label.
export function CategoryQuickAdd({ onCreated }: CategoryQuickAddProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"food" | "drink">("drink");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
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
      }
      setName("");
      setType("drink");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus /> เพิ่มหมวดหมู่
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>เพิ่มหมวดหมู่เมนู</DialogTitle>
          <DialogDescription>เช่น เครื่องดื่มร้อน, เครื่องดื่มเย็น, ของทานเล่น</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เครื่องดื่มเย็น"
            required
          />
          <Select value={type} onValueChange={(v) => v && setType(v as "food" | "drink")}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => TYPE_LABELS[v as "food" | "drink"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="drink">{TYPE_LABELS.drink}</SelectItem>
              <SelectItem value="food">{TYPE_LABELS.food}</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" className="w-full" disabled={isPending}>
            บันทึก
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
