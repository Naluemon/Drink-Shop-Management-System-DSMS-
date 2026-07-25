"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { softDeleteMenu } from "../actions/menus";
import { MenuFormDialog, type MenuFormValues, type SavedMenuFields } from "./menu-form-dialog";
import type { VariantRow, RecipeOption } from "./variant-manager";
import type { ModifierGroupOption } from "./modifier-groups-attacher";
import type { ModifierRow } from "./modifier-manager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/utils";

const ALL_CATEGORIES = "__all__";

export interface MenuRow {
  id: string;
  name: string;
  basePrice: string;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId: string | null;
  categoryName: string | null;
  recipeId: string;
  recipeName: string;
  recipeCost: number;
  variants: VariantRow[];
  modifierGroupIds: string[];
}

interface MenuListProps {
  initialMenus: MenuRow[];
  availableRecipes: (RecipeOption & { cost: number })[];
  availableCategories: { id: string; name: string }[];
  availableModifierGroups: (ModifierGroupOption & { modifiers: ModifierRow[] })[];
  canEdit: boolean;
}

export function MenuList({
  initialMenus,
  availableRecipes,
  availableCategories,
  availableModifierGroups,
  canEdit,
}: MenuListProps) {
  const [menus, setMenus] = useState(initialMenus);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Matches name, category, or price — a bare number like "45" finds every
  // menu priced ฿45.xx just as readily as typing the menu name would.
  const filtered = useMemo(() => {
    return menus.filter((m) => {
      if (categoryFilter !== ALL_CATEGORIES && m.categoryId !== categoryFilter) return false;
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        (m.categoryName ?? "").toLowerCase().includes(term) ||
        m.basePrice.includes(term)
      );
    });
  }, [menus, search, categoryFilter]);

  function handleCreated(fields: SavedMenuFields) {
    const recipe = availableRecipes.find((r) => r.id === fields.recipeId);
    setMenus((prev) =>
      [
        ...prev,
        {
          ...fields,
          recipeCost: recipe?.cost ?? 0,
          variants: [],
          modifierGroupIds: [],
        },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  function handleUpdated(fields: SavedMenuFields) {
    setMenus((prev) => prev.map((m) => (m.id === fields.id ? { ...m, ...fields } : m)));
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteMenu(id);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setMenus((prev) => prev.filter((m) => m.id !== id));
      toast.success("ลบเมนูสำเร็จ");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเมนู หมวดหมู่ หรือราคา..."
            className="max-w-xs"
          />
          {availableCategories.length > 0 && (
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v ?? ALL_CATEGORIES)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="ทุกหมวดหมู่">
                  {(v: string) =>
                    v === ALL_CATEGORIES
                      ? "ทุกหมวดหมู่"
                      : (availableCategories.find((c) => c.id === v)?.name ?? "ทุกหมวดหมู่")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>ทุกหมวดหมู่</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {canEdit && (
          <MenuFormDialog
            mode="create"
            availableRecipes={availableRecipes}
            availableCategories={availableCategories}
            availableModifierGroups={availableModifierGroups}
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
            <TableHead>ชื่อเมนู</TableHead>
            <TableHead>หมวดหมู่</TableHead>
            <TableHead>สูตร (ต้นทุน)</TableHead>
            <TableHead>ราคาตั้งต้น</TableHead>
            <TableHead>สถานะ</TableHead>
            {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 7 : 6} className="text-muted-foreground text-center">
                ไม่พบเมนู
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((m, index) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.categoryName ?? "—"}</TableCell>
                <TableCell>
                  {m.recipeName} ({formatBaht(m.recipeCost)})
                </TableCell>
                <TableCell>{formatBaht(Number(m.basePrice))}</TableCell>
                <TableCell>
                  {m.isAvailable ? (
                    <Badge>พร้อมขาย</Badge>
                  ) : (
                    <Badge variant="outline">ปิดขาย</Badge>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <MenuFormDialog
                        mode="edit"
                        availableRecipes={availableRecipes}
                        availableCategories={availableCategories}
                        availableModifierGroups={availableModifierGroups}
                        onSaved={handleUpdated}
                        initialValues={
                          {
                            id: m.id,
                            name: m.name,
                            recipeId: m.recipeId,
                            recipeCost: m.recipeCost,
                            categoryId: m.categoryId ?? "",
                            basePrice: m.basePrice,
                            imageUrl: m.imageUrl ?? "",
                            isAvailable: m.isAvailable,
                            variants: m.variants,
                            modifierGroupIds: m.modifierGroupIds,
                          } satisfies MenuFormValues
                        }
                      />
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="destructive" disabled={isPending} />}
                        triggerLabel="ลบ"
                        title={`ลบเมนู "${m.name}" ใช่ไหม?`}
                        description="เมนูนี้จะถูกนำออกจากรายการที่ใช้งานอยู่ กู้คืนได้ภายหลังหากจำเป็น"
                        confirmLabel="ลบ"
                        onConfirm={() => handleDelete(m.id)}
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
