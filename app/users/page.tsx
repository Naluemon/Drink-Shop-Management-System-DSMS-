import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { listUsers } from "@/features/users/actions/manage-users";
import { logout } from "@/features/auth/actions/logout";
import { canAccessPage } from "@/lib/page-access";
import { getRolePagePermissionMap } from "@/lib/page-access-server";
import { listRolePagePermissions } from "@/features/settings/actions/role-page-permissions";
import { AppShell } from "@/components/app-shell";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UserListTable } from "@/features/users/components/user-list-table";
import { RolePermissionGrid } from "@/features/settings/components/role-permission-grid";
import { PermissionChangeLog } from "@/features/settings/components/permission-change-log";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parsePageParam } from "@/lib/pagination";

// Phase 2 — RBAC & User Management. FR-USR-01: full roster is Owner-only
// (SECURITY.md §1 gives Manager "Invite" only on user_management, not "view"),
// so a Manager visiting this page gets just the invite card, not the list.
// The role-page-permission grid + its change history (moved here from
// Settings — this is where an owner actually thinks about "who can do what")
// are likewise Owner-only, same gate as the user roster above.
export default async function UsersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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

  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams?.page);

  const usersResult = role === "owner" ? await listUsers() : null;
  const rolePermResult = role === "owner" ? await listRolePagePermissions() : null;

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

        {role === "owner" && rolePermResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">สิทธิ์การใช้งานตามตำแหน่ง</CardTitle>
              <CardDescription>
                เลือกได้ว่าตำแหน่งไหนเข้าหน้าเมนูไหนได้บ้าง — เจ้าของร้านเข้าได้ทุกหน้าเสมอ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {"error" in rolePermResult ? (
                <p className="text-destructive text-sm">{rolePermResult.error}</p>
              ) : (
                <RolePermissionGrid initialRows={rolePermResult.rows} />
              )}
            </CardContent>
          </Card>
        )}

        {role === "owner" && (
          <Card>
            <CardHeader>
              <CardTitle>ประวัติการเปลี่ยนสิทธิ์</CardTitle>
            </CardHeader>
            <CardContent>
              <PermissionChangeLog page={page} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
