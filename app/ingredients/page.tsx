import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import { listIngredients, listSuppliers } from "@/features/ingredients/actions/ingredients";
import { AppShell } from "@/components/app-shell";
import { IngredientList } from "@/features/ingredients/components/ingredient-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 3 — Ingredient & Unit Conversion. SECURITY.md §1: Owner/Manager get
// full CRUD, Shift Supervisor/Cashier/Employee view-only, Accountant has no
// access at all (redirected below).
export default async function IngredientsPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "ingredients", permMap)) {
    redirect("/dashboard");
  }

  const [ingredientsResult, suppliersResult] = await Promise.all([
    listIngredients(),
    listSuppliers(),
  ]);

  if (ingredientsResult.error) {
    redirect("/dashboard");
  }

  const suppliers = (suppliersResult.suppliers ?? []).map((s) => ({ id: s.id, name: s.name }));

  const ingredients = (ingredientsResult.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    baseUnit: i.baseUnit,
    costPerUnit: i.costPerUnit.toString(),
    currentStockQty: i.currentStockQty.toString(),
    lowStockThreshold: i.lowStockThreshold?.toString() ?? null,
    supplierId: i.supplierId,
    supplierName: i.supplier?.name ?? null,
    unitConversions: i.unitConversions.map((c) => ({
      id: c.id,
      purchaseUnitName: c.purchaseUnitName,
      conversionFactor: c.conversionFactor.toString(),
    })),
  }));

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            วัตถุดิบ
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            จัดการวัตถุดิบ หน่วยฐาน และหน่วยซื้อ (unit conversion)
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>รายการวัตถุดิบ</CardTitle>
          </CardHeader>
          <CardContent>
            <IngredientList
              initialIngredients={ingredients}
              suppliers={suppliers}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
