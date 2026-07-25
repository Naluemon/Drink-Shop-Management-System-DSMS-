"use client";

import { useState } from "react";
import { CategoryQuickAdd } from "./category-quick-add";
import { MenuList, type MenuRow } from "./menu-list";
import type { RecipeOption } from "./variant-manager";
import type { ModifierGroupOption } from "./modifier-groups-attacher";
import type { ModifierRow } from "./modifier-manager";

interface MenusPageContentProps {
  initialMenus: MenuRow[];
  initialCategories: { id: string; name: string }[];
  availableRecipes: (RecipeOption & { cost: number })[];
  availableModifierGroups: (ModifierGroupOption & { modifiers: ModifierRow[] })[];
  canEdit: boolean;
}

export function MenusPageContent({
  initialMenus,
  initialCategories,
  availableRecipes,
  availableModifierGroups,
  canEdit,
}: MenusPageContentProps) {
  const [categories, setCategories] = useState(initialCategories);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <CategoryQuickAdd onCreated={(c) => setCategories((prev) => [...prev, c])} />
        </div>
      )}
      <MenuList
        initialMenus={initialMenus}
        availableCategories={categories}
        availableRecipes={availableRecipes}
        availableModifierGroups={availableModifierGroups}
        canEdit={canEdit}
      />
    </div>
  );
}
