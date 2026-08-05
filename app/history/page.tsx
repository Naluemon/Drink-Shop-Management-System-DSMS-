import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { listAuditLogs } from "@/features/history/actions/history";
import { AppShell } from "@/components/app-shell";
import { HistoryList } from "@/features/history/components/history-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  ingredient: "วัตถุดิบ",
  unit_conversion: "หน่วยซื้อ",
  menu_category: "หมวดหมู่เมนู",
  menu: "เมนู",
  menu_variant: "ตัวเลือกขนาด",
  modifier_group: "กลุ่มตัวเลือก",
  modifier: "ตัวเลือก",
  recipe: "สูตร",
  recipe_ingredient: "วัตถุดิบในสูตร",
  supplier: "ผู้จำหน่าย",
  user: "ผู้ใช้งาน",
  purchase_order: "ใบสั่งซื้อ",
  purchase_order_item: "รายการในใบสั่งซื้อ",
};

export default async function HistoryPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "history", permMap)) {
    redirect("/dashboard");
  }

  const result = await listAuditLogs();
  if ("error" in result) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ประวัติการใช้งาน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ใครเพิ่ม แก้ไข หรือลบข้อมูลอะไรไปบ้าง วันเวลาไหน
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ประวัติล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              initialLogs={result.logs}
              initialTotalPages={result.totalPages}
              entityTypeOptions={Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
