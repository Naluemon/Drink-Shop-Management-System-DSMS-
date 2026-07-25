import Link from "next/link";
import { requestPasswordReset } from "@/features/auth/actions/forgot-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const sent = searchParams?.sent === "1";

  async function handleSubmit(formData: FormData) {
    "use server";
    const { redirect } = await import("next/navigation");
    const result = await requestPasswordReset(formData);
    if (result?.error) {
      redirect(`/forgot-password?error=${encodeURIComponent(result.error)}`);
    }
    redirect("/forgot-password?sent=1");
  }

  const error = searchParams?.error as string | undefined;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="border-border/60 bg-card/95 relative w-full max-w-md shadow-2xl backdrop-blur-xl">
        <div className="from-primary via-primary to-accent absolute top-0 left-0 h-1.5 w-full rounded-t-xl bg-gradient-to-r" />
        <CardHeader className="mt-2 space-y-2 pb-6 text-center">
          <BrandMark className="mb-2" showWordmark={false} />
          <CardTitle className="text-3xl tracking-tight">ลืมรหัสผ่าน</CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            กรอกอีเมลที่ใช้ล็อกอิน เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ToastFromSearchParams error={error} />

          {sent ? (
            <div className="border-accent/30 bg-accent/10 text-accent rounded-lg border p-3 text-sm">
              หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้คุณ
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
                />
              </div>
              <Button
                className="h-11 w-full text-base font-medium shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                type="submit"
              >
                ส่งลิงก์รีเซ็ตรหัสผ่าน
              </Button>
            </form>
          )}

          <p className="text-muted-foreground mt-6 text-center text-sm">
            <Link href="/login" className="text-primary font-medium hover:underline">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
