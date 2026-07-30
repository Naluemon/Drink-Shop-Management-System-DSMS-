import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import { listRecipes } from "@/features/recipes/actions/recipes";
import { listIngredients } from "@/features/ingredients/actions/ingredients";
import { AppShell } from "@/components/app-shell";
import { RecipeList } from "@/features/recipes/components/recipe-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 4 — Recipe. SECURITY.md §1: Owner/Manager CRUD, Shift
// Supervisor/Cashier view-only, Employee/Accountant no access.
export default async function RecipesPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "recipes", permMap)) {
    redirect("/dashboard");
  }

  const [recipesResult, ingredientsResult] = await Promise.all([listRecipes(), listIngredients()]);

  if (recipesResult.error) {
    redirect("/dashboard");
  }

  const availableIngredients = (ingredientsResult.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    baseUnit: i.baseUnit,
    costPerUnit: i.costPerUnit.toString(),
  }));

  const recipes = (recipesResult.recipes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    yield: r.yield,
    cost: r.cost,
    ingredients: r.ingredients.map((ri) => ({
      id: ri.id,
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredientName,
      baseUnit: ri.baseUnit,
      quantity: ri.quantity,
    })),
  }));

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            สูตร
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            จัดการสูตร วัตถุดิบ และ yield — ต้นทุนคำนวณสดจากราคาวัตถุดิบปัจจุบันเสมอ
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>รายการสูตร</CardTitle>
          </CardHeader>
          <CardContent>
            <RecipeList
              initialRecipes={recipes}
              availableIngredients={availableIngredients}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
