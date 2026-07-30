import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { listMenus, listMenuCategories, getRecipeOptions } from "@/features/menus/actions/menus";
import { listModifierGroups } from "@/features/menus/actions/modifier-groups";
import { calculateRecipeCost } from "@/lib/cost-cascade";
import { AppShell } from "@/components/app-shell";
import { MenusPageContent } from "@/features/menus/components/menus-page-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 5 — Menu, Variant & Modifier. SECURITY.md §1: Owner/Manager CRUD,
// Shift Supervisor/Cashier view-only, Employee/Accountant no access.
export default async function MenusPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "menus", permMap)) {
    redirect("/dashboard");
  }

  const [menusResult, categoriesResult, recipesResult, groupsResult] = await Promise.all([
    listMenus(),
    listMenuCategories(),
    getRecipeOptions(),
    listModifierGroups(),
  ]);

  if (menusResult.error) {
    redirect("/dashboard");
  }

  const availableRecipes = await Promise.all(
    (recipesResult.recipes ?? []).map(async (r) => ({
      id: r.id,
      name: r.name,
      cost: await calculateRecipeCost(r.id),
    })),
  );

  const availableModifierGroups = (groupsResult.groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    modifiers: g.modifiers,
  }));

  const menus = (menusResult.menus ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    basePrice: m.basePrice,
    imageUrl: m.imageUrl,
    isAvailable: m.isAvailable,
    categoryId: m.categoryId,
    categoryName: m.categoryName,
    recipeId: m.recipeId,
    recipeName: m.recipeName,
    recipeCost: m.recipeCost,
    variants: m.variants,
    modifierGroupIds: m.modifierGroupIds,
  }));

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            เมนู
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            จัดการเมนู ราคา ตัวเลือกขนาด (variant) และกลุ่มตัวเลือกเสริม
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>รายการเมนู</CardTitle>
          </CardHeader>
          <CardContent>
            <MenusPageContent
              initialMenus={menus}
              initialCategories={categoriesResult.categories ?? []}
              availableRecipes={availableRecipes}
              availableModifierGroups={availableModifierGroups}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
