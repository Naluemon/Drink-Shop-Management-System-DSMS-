import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { hasPermission } from "@/lib/permissions";
import { getDashboardData } from "@/features/dashboard/actions/dashboard";
import { AppShell } from "@/components/app-shell";
import { DashboardContent } from "@/features/dashboard/components/dashboard-content";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 10 — Dashboard. SECURITY.md §1: only Owner/Manager/Shift Supervisor
// have "view" on the "dashboard" resource — Cashier/Employee/Accountant still
// land here after login (this route is the universal post-login/no-access
// redirect target set up in Phase 1), but see a plain welcome card instead
// of the KPI widgets.
export default async function DashboardPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const canViewDashboard = hasPermission(profile.user.role, "view", "dashboard");

  if (!canViewDashboard) {
    return (
      <AppShell user={profile.user} logoutAction={logout}>
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">สวัสดีคุณ {profile.user.fullName}</CardTitle>
              <CardDescription>ใช้เมนูมุมซ้ายเพื่อไปยังส่วนที่คุณมีสิทธิ์เข้าถึง</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                เข้าไปที่เมนูมุมซ้ายเพื่อไปยังส่วนต่างๆ หรือมุมล่างซ้ายเพื่อดู/แก้ไขโปรไฟล์ของคุณ
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const dashboardResult = await getDashboardData();
  if (dashboardResult.error || !dashboardResult.today || !dashboardResult.yesterday) {
    redirect("/login");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            แดชบอร์ด
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            สวัสดีคุณ {profile.user.fullName} — ภาพรวมวันนี้เทียบกับเมื่อวาน (นับตามวันทางธุรกิจ)
          </p>
        </div>

        <DashboardContent
          today={dashboardResult.today}
          yesterday={dashboardResult.yesterday}
          bestSellers={dashboardResult.bestSellers ?? []}
          lowStockItems={dashboardResult.lowStockItems ?? []}
          trend={dashboardResult.trend ?? []}
        />
      </div>
    </AppShell>
  );
}
