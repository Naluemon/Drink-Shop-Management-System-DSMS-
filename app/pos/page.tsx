import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { getPosMenuData } from "@/features/pos/actions/pos-menu";
import { listRecentTransactions } from "@/features/pos/actions/void-refund";
import { AppShell } from "@/components/app-shell";
import { PosTerminal } from "@/features/pos/components/pos-terminal";
import { RecentTransactionsPanel } from "@/features/pos/components/recent-transactions-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePageParam } from "@/lib/pagination";

// Phase 8 — POS. SECURITY.md §1: Owner/Shift Supervisor/Cashier "create"
// pos_sale (owner can always sell too, not just view reports); Manager only
// has "view", Employee/Accountant have no access.
export default async function PosPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "pos", permMap)) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams?.page);

  const [menuResult, transactionsResult] = await Promise.all([
    getPosMenuData(),
    listRecentTransactions(page),
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
            <RecentTransactionsPanel
              initialTransactions={transactionsResult.transactions ?? []}
              page={transactionsResult.page ?? 1}
              totalPages={transactionsResult.totalPages ?? 1}
              total={transactionsResult.total ?? 0}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
