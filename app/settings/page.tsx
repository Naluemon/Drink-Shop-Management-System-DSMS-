import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { getRefundApprovalThreshold } from "@/features/settings/actions/refund-threshold";
import { getFullSettings } from "@/features/settings/actions/company-settings";
import { listAllReasonCodes } from "@/features/settings/actions/reason-codes";
import { AppShell } from "@/components/app-shell";
import { SettingsPageContent } from "@/features/settings/components/settings-page-content";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

// Phase 12 — Settings. Owner-only per SECURITY.md §1 (settings: CRUD is
// Owner-only, no other role has access). Refund approval threshold (D5/D14,
// Phase 2) now lives inside SettingsPageContent's "การดำเนินงาน" tab, same
// instant-save pattern as every other section — it used to be a separate
// server-rendered form with its own redirect-based error/success flow, the
// one section on this page that behaved differently from the rest.
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

  const [thresholdResult, fullSettingsResult, reasonCodesResult] = await Promise.all([
    getRefundApprovalThreshold(),
    getFullSettings(),
    listAllReasonCodes(),
  ]);

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ตั้งค่าระบบ
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ข้อมูลร้าน, ภาษี, ใบเสร็จ, เวลาทำการ, นโยบายสต็อก และรายการเหตุผล
          </p>
        </div>

        <ToastFromSearchParams error={error} message={message} />

        {"error" in fullSettingsResult ||
        "error" in reasonCodesResult ||
        "error" in thresholdResult ? (
          <p className="text-destructive text-sm">
            {("error" in fullSettingsResult && fullSettingsResult.error) ||
              ("error" in reasonCodesResult && reasonCodesResult.error) ||
              ("error" in thresholdResult && thresholdResult.error)}
          </p>
        ) : (
          <SettingsPageContent
            companySettings={fullSettingsResult.companySettings}
            taxSettings={fullSettingsResult.taxSettings}
            ingredients={fullSettingsResult.ingredients}
            reasonCodes={reasonCodesResult.codes}
            refundThreshold={thresholdResult.threshold}
          />
        )}
      </div>
    </AppShell>
  );
}
