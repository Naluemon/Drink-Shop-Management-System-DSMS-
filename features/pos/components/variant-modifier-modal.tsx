"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PosMenu } from "./pos-terminal";
import { formatBaht } from "@/lib/utils";

interface VariantModifierModalProps {
  menu: PosMenu;
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: { variantId: string | null; modifierIds: string[] }) => void;
}

// FR-POS-02 / UI_UX.md §3: modal บังคับเลือก modifier group ที่ is_required
// ก่อนเพิ่มลงตะกร้าได้ — ปุ่ม "เพิ่มลงตะกร้า" disable จนกว่าจะครบ (แทนการ
// ล็อกไม่ให้ปิด modal เลย ซึ่งจะกลายเป็นกับดักผู้ใช้ถ้าเปลี่ยนใจไม่ซื้อ)
export function VariantModifierModal({
  menu,
  open,
  onClose,
  onConfirm,
}: VariantModifierModalProps) {
  const defaultVariant = menu.variants.find((v) => v.isDefault) ?? menu.variants[0];
  const [variantId, setVariantId] = useState<string | null>(defaultVariant?.id ?? null);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  const allRequiredSatisfied = menu.modifierGroups
    .filter((g) => g.isRequired)
    .every((g) => (selectedByGroup[g.id]?.length ?? 0) > 0);

  const selectedVariant = menu.variants.find((v) => v.id === variantId) ?? null;
  const selectedModifierIds = Object.values(selectedByGroup).flat();

  const preview = useMemo(() => {
    const variantCost = selectedVariant?.cost ?? menu.mainRecipeCost;
    const variantPriceDelta = selectedVariant ? Number(selectedVariant.priceDelta) : 0;
    let priceDelta = variantPriceDelta;
    let costAdd = 0;
    for (const group of menu.modifierGroups) {
      for (const mod of group.modifiers) {
        if (selectedModifierIds.includes(mod.id)) {
          priceDelta += Number(mod.priceDelta);
          costAdd += mod.cost;
        }
      }
    }
    return { price: Number(menu.basePrice) + priceDelta, cost: variantCost + costAdd };
  }, [selectedVariant, selectedModifierIds, menu]);

  function toggleModifier(groupId: string, modifierId: string, selectionType: string) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      if (selectionType === "single") {
        return { ...prev, [groupId]: current.includes(modifierId) ? [] : [modifierId] };
      }
      return {
        ...prev,
        [groupId]: current.includes(modifierId)
          ? current.filter((id) => id !== modifierId)
          : [...current, modifierId],
      };
    });
  }

  function handleConfirm() {
    onConfirm({ variantId, modifierIds: selectedModifierIds });
    onClose();
    setSelectedByGroup({});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{menu.name}</DialogTitle>
          <DialogDescription>เลือกขนาดและตัวเลือกเสริม</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {menu.variants.length > 0 && (
            <div className="space-y-2">
              <Label>ขนาด</Label>
              <div className="grid grid-cols-3 gap-2">
                {menu.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      variantId === v.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {menu.modifierGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <Label>
                {group.name}
                {group.isRequired && <span className="text-destructive"> *</span>}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {group.modifiers.map((mod) => {
                  const selected = (selectedByGroup[group.id] ?? []).includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(group.id, mod.id, group.selectionType)}
                      className={`min-h-11 rounded-lg border px-2 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {mod.name}
                      {Number(mod.priceDelta) !== 0 && (
                        <span className="text-muted-foreground block text-xs">
                          {Number(mod.priceDelta) > 0 ? "+" : ""}
                          {mod.priceDelta} บาท
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-border bg-muted/30 rounded-lg border p-3 text-sm">
            ราคา <strong>{formatBaht(preview.price)}</strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            ยกเลิก
          </Button>
          <Button onClick={handleConfirm} disabled={!allRequiredSatisfied} type="button">
            เพิ่มลงตะกร้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
