"use client";

import { useState, useTransition } from "react";
import { setMenuModifierGroups } from "../actions/menus";
import { Label } from "@/components/ui/label";

export interface ModifierGroupOption {
  id: string;
  name: string;
}

interface ModifierGroupsAttacherProps {
  menuId: string;
  availableGroups: ModifierGroupOption[];
  initialSelectedIds: string[];
  onChange?: (ids: string[]) => void;
}

// FR-MENU-04: ผูก modifier_group เข้ากับเมนู (many-to-many ผ่าน MenuModifierGroup)
export function ModifierGroupsAttacher({
  menuId,
  availableGroups,
  initialSelectedIds,
  onChange,
}: ModifierGroupsAttacherProps) {
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(groupId: string) {
    const next = new Set(selectedIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setSelectedIds(next);
    setError(null);
    startTransition(async () => {
      const result = await setMenuModifierGroups(menuId, Array.from(next));
      if (result?.error) {
        setError(result.error);
        return;
      }
      onChange?.(Array.from(next));
    });
  }

  if (availableGroups.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        ยังไม่มีกลุ่มตัวเลือก — สร้างได้ที่หน้า &quot;กลุ่มตัวเลือกเมนู&quot;
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label>กลุ่มตัวเลือกที่ผูกกับเมนูนี้</Label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <ul className="space-y-1">
        {availableGroups.map((g) => (
          <li key={g.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.has(g.id)}
                onChange={() => toggle(g.id)}
                className="text-primary border-input focus:ring-ring size-4 rounded"
              />
              {g.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
