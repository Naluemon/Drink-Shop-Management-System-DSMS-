import { redirect } from "next/navigation";
import { validateInviteToken, acceptInvite } from "@/features/auth/actions/invite";
import { InviteAcceptForm } from "@/features/auth/components/invite-accept-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

export default async function InviteAcceptPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams?.token as string | undefined;

  if (!token) {
    redirect("/login?error=" + encodeURIComponent("ลิงก์คำเชิญไม่ถูกต้อง"));
  }

  const validation = await validateInviteToken(token);

  if (!validation.valid) {
    redirect(
      `/login?error=${encodeURIComponent(validation.error ?? "ลิงก์คำเชิญไม่ถูกต้องหรือหมดอายุแล้ว")}`,
    );
  }

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await acceptInvite(token!, formData);
    if (result?.error) {
      redirect(
        `/invite/accept?token=${encodeURIComponent(token!)}&error=${encodeURIComponent(result.error)}`,
      );
    }
  }

  const error = searchParams?.error as string | undefined;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="border-border/60 bg-card/95 relative w-full max-w-md shadow-2xl backdrop-blur-xl">
        <div className="from-primary via-primary to-accent absolute top-0 left-0 h-1.5 w-full rounded-t-xl bg-gradient-to-r" />
        <CardHeader className="mt-2 space-y-2 pb-6 text-center">
          <BrandMark className="mb-2" showWordmark={false} />
          <CardTitle className="text-3xl tracking-tight">ตั้งค่าบัญชีของคุณ</CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            คุณได้รับเชิญเข้าใช้งานด้วยอีเมล{" "}
            <strong className="text-foreground">{validation.email}</strong>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ToastFromSearchParams error={error} />

          <InviteAcceptForm action={handleSubmit} />
        </CardContent>
      </Card>
    </div>
  );
}
