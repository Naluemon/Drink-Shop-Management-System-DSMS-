import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import { listRefundQueue } from "@/features/pos/actions/void-refund";
import { AppShell } from "@/components/app-shell";
import { RefundQueue } from "@/features/pos/components/refund-queue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 8 — Refund approval queue. DECISIONS.md D5/D14: Shift Supervisor
// approves within refund_approval_threshold, Manager/Owner approve any
// amount. Cashier/Employee/Accountant have no approval access.
export default async function RefundsPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "refunds", permMap)) {
    redirect("/dashboard");
  }

  const queueResult = await listRefundQueue();
  if (queueResult.error) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            คิวอนุมัติคืนเงิน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            คำขอคืนเงินสำหรับรายการขายที่ข้ามวันทางธุรกิจแล้ว
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">คำขอที่รออนุมัติ</CardTitle>
          </CardHeader>
          <CardContent>
            <RefundQueue
              initialRequests={queueResult.requests ?? []}
              threshold={queueResult.threshold ?? "0"}
              canApproveAny={role === "owner" || role === "manager"}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
