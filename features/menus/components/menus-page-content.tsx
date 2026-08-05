"use client";

import { useState } from "react";
import { CategoryManager, type CategoryRow } from "./category-manager";
import { MenuList, type MenuRow } from "./menu-list";
import type { RecipeOption } from "./variant-manager";
import type { ModifierGroupOption } from "./modifier-groups-attacher";
import type { ModifierRow } from "./modifier-manager";

interface MenusPageContentProps {
  initialMenus: MenuRow[];
  initialCategories: CategoryRow[];
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
          <CategoryManager
            categories={categories}
            onCreated={(c) => setCategories((prev) => [...prev, c])}
            onUpdated={(c) =>
              setCategories((prev) => prev.map((existing) => (existing.id === c.id ? c : existing)))
            }
            onDeleted={(id) => setCategories((prev) => prev.filter((c) => c.id !== id))}
          />
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
