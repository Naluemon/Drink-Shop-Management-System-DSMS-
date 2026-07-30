import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { listStockLevels } from "@/features/inventory/actions/inventory";
import { listReasonCodes } from "@/features/settings/actions/reason-codes";
import { AppShell } from "@/components/app-shell";
import { InventoryPageContent } from "@/features/inventory/components/inventory-page-content";
import { MovementLedger } from "@/features/inventory/components/movement-ledger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/table-skeleton";
import { parsePageParam } from "@/lib/pagination";

// Phase 6 — Inventory. SECURITY.md §1: Owner/Manager CRUD, Shift Supervisor
// create-only (stock in/out), Employee create-only (stock in/out), Cashier
// and Accountant have no access to Inventory at all.
export default async function InventoryPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);

  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "inventory", permMap)) {
    redirect("/dashboard");
  }

  const [stockResult, reasonCodesResult] = await Promise.all([
    listStockLevels(),
    listReasonCodes(),
  ]);
  if (stockResult.error) {
    redirect("/dashboard");
  }

  const canViewLedger = role === "owner" || role === "manager";

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            สต็อก
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ระดับสต็อกปัจจุบัน, รับเข้า/จ่ายออก/ปรับปรุง และประวัติการเคลื่อนไหว
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ภาพรวมสต็อก</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryPageContent
              stockLevels={stockResult.ingredients ?? []}
              reasonCodes={reasonCodesResult.codes ?? []}
              canAdjust={role === "owner" || role === "manager"}
              canRecordMovements
            />
          </CardContent>
        </Card>

        {canViewLedger && (
          <Card>
            <CardContent className="pt-6">
              <Suspense fallback={<TableSkeleton columns={7} />}>
                <MovementLedger page={page} />
              </Suspense>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
