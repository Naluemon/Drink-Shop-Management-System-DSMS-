import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { hasPermission } from "@/lib/permissions";
import { getPosMenuData } from "@/features/pos/actions/pos-menu";
import { listRecentTransactions } from "@/features/pos/actions/void-refund";
import { AppShell } from "@/components/app-shell";
import { PosTerminal } from "@/features/pos/components/pos-terminal";
import { RecentTransactionsPanel } from "@/features/pos/components/recent-transactions-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 8 — POS. SECURITY.md §1: only Shift Supervisor/Cashier "create"
// pos_sale — Owner/Manager only have "view" (they see sales in Reports,
// Phase 11, not this register screen), Employee/Accountant have no access.
export default async function PosPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "pos", permMap)) {
    redirect("/dashboard");
  }

  // Owner passes canAccessPage() unconditionally (D19: owner can never be
  // locked out), but the CRUD matrix in lib/permissions.ts only grants owner
  // "view" on pos_sale — so getPosMenuData() below would deny it. Redirecting
  // straight back to /dashboard from a nav link that renders enabled reads as
  // a broken link, so show the same "you can open this page but not use this
  // feature" card app/dashboard/page.tsx uses for its own no-view-permission
  // case instead. Owner is the only role that can reach here without
  // "create pos_sale": the seeded pos defaults are shift_supervisor/cashier
  // (both of which do have it), and Fix 2's revoke-only rule means no other
  // role can ever be granted "pos" beyond that seed.
  if (!hasPermission(role, "create", "pos_sale")) {
    return (
      <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">หน้าขาย (POS)</CardTitle>
              <CardDescription>
                หน้านี้สำหรับพนักงานที่ขายหน้าร้าน (หัวหน้ากะ/แคชเชียร์)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                ตำแหน่งของคุณเปิดหน้านี้ได้ แต่ไม่ได้รับสิทธิ์ &quot;สร้างรายการขาย&quot;
                จึงใช้หน้าขายไม่ได้ — ดูยอดขายและรายการขายทั้งหมดได้ที่เมนู &quot;รายงาน&quot;
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const [menuResult, transactionsResult] = await Promise.all([
    getPosMenuData(),
    listRecentTransactions(),
  ]);

  if (menuResult.error) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            หน้าขาย (POS)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            เลือกเมนู เก็บเงิน และจัดการรายการขายหน้าร้าน
          </p>
        </div>

        <PosTerminal menus={menuResult.menus ?? []} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">รายการขายล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentTransactionsPanel initialTransactions={transactionsResult.transactions ?? []} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
