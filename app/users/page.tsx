import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { listUsers } from "@/features/users/actions/manage-users";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import { AppShell } from "@/components/app-shell";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UserListTable } from "@/features/users/components/user-list-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Phase 2 — RBAC & User Management. FR-USR-01: full roster is Owner-only
// (SECURITY.md §1 gives Manager "Invite" only on user_management, not "view"),
// so a Manager visiting this page gets just the invite card, not the list.
export default async function UsersPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "users", permMap)) {
    redirect("/dashboard");
  }
  if (role !== "owner" && role !== "manager") {
    // canAccessPage only gates *page* access — an owner could in principle grant
    // "users" page access to another role, but the invite UI below is only ever
    // built for owner/manager. Redirect rather than render it broken for anyone else.
    redirect("/dashboard");
  }

  const usersResult = role === "owner" ? await listUsers() : null;

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
              จัดการผู้ใช้
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {role === "owner"
                ? "รายชื่อผู้ใช้ทั้งหมดในระบบ และเชิญผู้ใช้ใหม่"
                : "เชิญพนักงานใหม่เข้าใช้งานระบบ"}
            </p>
          </div>
          <InviteUserDialog actorRole={role} />
        </div>

        {role === "owner" && usersResult && (
          <Card>
            <CardHeader>
              <CardTitle>รายชื่อผู้ใช้</CardTitle>
              <CardDescription>{usersResult.users?.length ?? 0} คน</CardDescription>
            </CardHeader>
            <CardContent>
              {usersResult.error ? (
                <p className="text-destructive text-sm">{usersResult.error}</p>
              ) : (
                <UserListTable
                  initialUsers={usersResult.users ?? []}
                  currentUserId={profile.user.id}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
