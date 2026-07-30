import { redirect } from "next/navigation";
import { getProfile, updateProfile, changePassword } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap } from "@/lib/page-access";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

// DECISIONS.md D15 / IMPLEMENTATION_PLAN Phase 1: ผู้ใช้ดู/แก้ไขชื่อ-อีเมลตนเองได้
export default async function ProfilePage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getProfile();

  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const error = searchParams?.error as string | undefined;
  const message = searchParams?.message as string | undefined;
  const permMap = await getRolePagePermissionMap();

  async function handleUpdateProfile(formData: FormData) {
    "use server";
    const result = await updateProfile(formData);
    if (result?.error) {
      redirect(`/profile?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/profile?message=${encodeURIComponent(result?.message ?? "อัปเดตข้อมูลสำเร็จ")}`);
  }

  async function handleChangePassword(formData: FormData) {
    "use server";
    const result = await changePassword(formData);
    if (result?.error) {
      redirect(`/profile?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/profile?message=${encodeURIComponent(result?.message ?? "เปลี่ยนรหัสผ่านสำเร็จ")}`);
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            โปรไฟล์ของฉัน
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">ดูและแก้ไขข้อมูลส่วนตัวของคุณ</p>
        </div>

        <ToastFromSearchParams error={error} message={message} />

        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลส่วนตัว</CardTitle>
            <CardDescription>ชื่อและอีเมลของคุณ</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  defaultValue={profile.user.fullName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={profile.user.email}
                  required
                />
              </div>
              <Button type="submit">บันทึกการเปลี่ยนแปลง</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>เปลี่ยนรหัสผ่าน</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">รหัสผ่านปัจจุบัน</Label>
                <Input id="currentPassword" name="currentPassword" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">รหัสผ่านใหม่</Label>
                <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
                <p className="text-muted-foreground text-xs">
                  รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">ยืนยันรหัสผ่านใหม่</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit">เปลี่ยนรหัสผ่าน</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
