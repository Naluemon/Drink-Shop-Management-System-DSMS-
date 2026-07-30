import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { AppShell } from "@/components/app-shell";
import { ReportsPageContent } from "@/features/reports/components/reports-page-content";

// Phase 11 — Reports. SECURITY.md §1: Owner/Manager/Shift Supervisor (full
// access), Accountant (Sales/Profit/Expense only — FR-RPT-06, D14). Cashier/
// Employee have no access to Reports at all.
export default async function ReportsPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "reports", permMap)) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            รายงาน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ยอดขาย, กำไร-ขาดทุน, ค่าใช้จ่าย, เมนูขายดี และสต็อก — คำนวณจากบันทึกจริงทุกครั้ง
          </p>
        </div>

        <ReportsPageContent canViewOperational={role !== "accountant"} />
      </div>
    </AppShell>
  );
}
