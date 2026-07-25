import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { AppShell } from "@/components/app-shell";
import { GuideContent } from "@/features/guide/components/guide-content";

// Documentation only, no permission gate — every role should be able to look
// up how to use the parts of the system they do have access to.
export default async function GuidePage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            คู่มือการใช้งาน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            วิธีใช้งานแต่ละส่วนของระบบ ตั้งแต่เข้าสู่ระบบจนถึงออกรายงาน
          </p>
        </div>

        <GuideContent />
      </div>
    </AppShell>
  );
}
