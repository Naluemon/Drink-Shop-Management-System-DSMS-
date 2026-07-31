import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import {
  getRefundApprovalThreshold,
  updateRefundApprovalThreshold,
} from "@/features/settings/actions/refund-threshold";
import { getFullSettings } from "@/features/settings/actions/company-settings";
import { listAllReasonCodes } from "@/features/settings/actions/reason-codes";
import { listRolePagePermissions } from "@/features/settings/actions/role-page-permissions";
import { AppShell } from "@/components/app-shell";
import { SettingsPageContent } from "@/features/settings/components/settings-page-content";
import { PermissionChangeLog } from "@/features/settings/components/permission-change-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";
import { parsePageParam } from "@/lib/pagination";

// Phase 12 — Settings. Owner-only per SECURITY.md §1 (settings: CRUD is
// Owner-only, no other role has access). Refund approval threshold
// (D5/D14, Phase 2) keeps its original server-rendered form below.
export default async function SettingsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(profile.user.role, "settings", permMap)) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const error = searchParams?.error as string | undefined;
  const message = searchParams?.message as string | undefined;
  const page = parsePageParam(searchParams?.page);

  const [thresholdResult, fullSettingsResult, reasonCodesResult, rolePermResult] =
    await Promise.all([
      getRefundApprovalThreshold(),
      getFullSettings(),
      listAllReasonCodes(),
      listRolePagePermissions(),
    ]);

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await updateRefundApprovalThreshold(formData);
    if (result?.error) {
      redirect(`/settings?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/settings?message=${encodeURIComponent(result?.message ?? "บันทึกสำเร็จ")}`);
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ตั้งค่าระบบ
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ข้อมูลร้าน, ภาษี, ใบเสร็จ, เวลาทำการ, นโยบายสต็อก, รายการเหตุผล และธีม
          </p>
        </div>

        <ToastFromSearchParams error={error} message={message} />

        {"error" in fullSettingsResult || "error" in reasonCodesResult ? (
          <p className="text-destructive text-sm">
            {("error" in fullSettingsResult && fullSettingsResult.error) ||
              ("error" in reasonCodesResult && reasonCodesResult.error)}
          </p>
        ) : (
          <SettingsPageContent
            companySettings={fullSettingsResult.companySettings}
            taxSettings={fullSettingsResult.taxSettings}
            ingredients={fullSettingsResult.ingredients}
            reasonCodes={reasonCodesResult.codes}
            rolePagePermissionRows={"rows" in rolePermResult ? rolePermResult.rows : []}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>วงเงินอนุมัติคืนเงินของหัวหน้ากะ</CardTitle>
            <CardDescription>
              Shift Supervisor อนุมัติคำขอคืนเงินได้เองถ้ายอดไม่เกินจำนวนนี้ ยอดที่เกินต้องส่งต่อ
              Manager/Owner (DECISIONS.md D5, D14)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {thresholdResult.error ? (
              <p className="text-destructive text-sm">{thresholdResult.error}</p>
            ) : (
              <form action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold">วงเงิน (บาท)</Label>
                  <Input
                    id="threshold"
                    name="threshold"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={thresholdResult.threshold}
                  />
                </div>
                <Button type="submit">บันทึก</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ประวัติการเปลี่ยนสิทธิ์</CardTitle>
          </CardHeader>
          <CardContent>
            <PermissionChangeLog page={page} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
