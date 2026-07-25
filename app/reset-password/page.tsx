import { redirect } from "next/navigation";
import { resetPassword } from "@/features/auth/actions/forgot-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const error = searchParams?.error as string | undefined;

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await resetPassword(formData);
    if (result?.error) {
      redirect(`/reset-password?error=${encodeURIComponent(result.error)}`);
    }
    redirect("/login?message=" + encodeURIComponent("รีเซ็ตรหัสผ่านสำเร็จ กรุณาล็อกอินใหม่"));
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="border-border/60 bg-card/95 relative w-full max-w-md shadow-2xl backdrop-blur-xl">
        <div className="from-primary via-primary to-accent absolute top-0 left-0 h-1.5 w-full rounded-t-xl bg-gradient-to-r" />
        <CardHeader className="mt-2 space-y-2 pb-6 text-center">
          <BrandMark className="mb-2" showWordmark={false} />
          <CardTitle className="text-3xl tracking-tight">ตั้งรหัสผ่านใหม่</CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            กรอกรหัสผ่านใหม่ของคุณ
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ToastFromSearchParams error={error} />

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่านใหม่</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
              />
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
                className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
              />
            </div>
            <Button
              className="h-11 w-full text-base font-medium shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              type="submit"
            >
              บันทึกรหัสผ่านใหม่
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
