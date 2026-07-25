import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { listModifierGroups } from "@/features/menus/actions/modifier-groups";
import { listIngredients } from "@/features/ingredients/actions/ingredients";
import { AppShell } from "@/components/app-shell";
import { ModifierGroupList } from "@/features/menus/components/modifier-group-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 5 — Modifier Group + Modifier. Permission shares the "menu" resource
// (SECURITY.md §1 has one combined "Menu (+ Variant/Modifier)" row).
export default async function ModifierGroupsPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  if (role === "employee" || role === "accountant") {
    redirect("/dashboard");
  }

  const [groupsResult, ingredientsResult] = await Promise.all([
    listModifierGroups(),
    listIngredients(),
  ]);

  if (groupsResult.error) {
    redirect("/dashboard");
  }

  const availableIngredients = (ingredientsResult.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    baseUnit: i.baseUnit,
  }));

  const groups = (groupsResult.groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    selectionType: g.selectionType,
    isRequired: g.isRequired,
    modifiers: g.modifiers,
  }));

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            กลุ่มตัวเลือกเมนู
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            เช่น Topping, ระดับความหวาน, ระดับน้ำแข็ง — ผูกกับเมนูได้ในหน้าเมนู
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>รายการกลุ่มตัวเลือก</CardTitle>
          </CardHeader>
          <CardContent>
            <ModifierGroupList
              initialGroups={groups}
              availableIngredients={availableIngredients}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
