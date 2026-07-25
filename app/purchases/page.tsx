import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { listPurchaseOrders } from "@/features/purchases/actions/purchase-orders";
import { listSuppliers } from "@/features/purchases/actions/suppliers";
import { listIngredients } from "@/features/ingredients/actions/ingredients";
import { AppShell } from "@/components/app-shell";
import { PurchaseOrderList } from "@/features/purchases/components/purchase-order-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePageParam } from "@/lib/pagination";

// Phase 7 — Purchase. SECURITY.md §1: Owner/Manager CRUD, Shift Supervisor
// view-only, others no access.
export default async function PurchasesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);
  const supplierFilter =
    typeof searchParams.supplier === "string" && searchParams.supplier
      ? searchParams.supplier
      : undefined;

  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  if (role === "cashier" || role === "employee" || role === "accountant") {
    redirect("/dashboard");
  }

  const [ordersResult, suppliersResult, ingredientsResult] = await Promise.all([
    listPurchaseOrders({ supplierId: supplierFilter }, page),
    listSuppliers(),
    listIngredients(),
  ]);

  if (ordersResult.error) {
    redirect("/dashboard");
  }

  const suppliers = (suppliersResult.suppliers ?? []).map((s) => ({ id: s.id, name: s.name }));

  const availableIngredients = (ingredientsResult.ingredients ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    unitConversions: i.unitConversions.map((c) => ({ purchaseUnitName: c.purchaseUnitName })),
  }));

  const orders = (ordersResult.orders ?? []).map((o) => ({
    id: o.id,
    status: o.status,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    orderedAt: o.orderedAt,
    receivedAt: o.receivedAt,
    items: o.items,
  }));

  const canEdit = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ใบสั่งซื้อ
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            สร้างใบสั่งซื้อ รับของเข้าสต็อก ต้นทุนคำนวณแบบ WAC อัตโนมัติ (DECISIONS.md D1)
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ประวัติใบสั่งซื้อ</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseOrderList
              orders={orders}
              suppliers={suppliers}
              availableIngredients={availableIngredients}
              canEdit={canEdit}
              supplierFilter={supplierFilter}
              pendingCount={ordersResult.pendingCount ?? 0}
              page={ordersResult.page ?? 1}
              totalPages={ordersResult.totalPages ?? 1}
              total={ordersResult.total ?? 0}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
