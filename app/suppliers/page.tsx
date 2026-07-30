import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import { listSuppliers } from "@/features/purchases/actions/suppliers";
import { AppShell } from "@/components/app-shell";
import { SupplierList } from "@/features/purchases/components/supplier-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 7 — Purchase. SECURITY.md §1 groups Supplier under "Purchase":
// Owner/Manager CRUD, Shift Supervisor view-only, others no access.
export default async function SuppliersPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "suppliers", permMap)) {
    redirect("/dashboard");
  }

  const suppliersResult = await listSuppliers();
  if (suppliersResult.error) {
    redirect("/dashboard");
  }

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ผู้จำหน่าย
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">จัดการรายชื่อผู้จำหน่ายวัตถุดิบ</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>รายชื่อผู้จำหน่าย</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierList initialSuppliers={suppliersResult.suppliers ?? []} canEdit={canEdit} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
