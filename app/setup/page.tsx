import { bootstrapOwner, checkBootstrapStatus } from "@/features/auth/actions/bootstrap";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";

export default async function SetupPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const isBootstrap = await checkBootstrapStatus();
  if (!isBootstrap) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const error = searchParams?.error as string | undefined;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="border-border/60 bg-card/95 relative w-full max-w-md shadow-2xl backdrop-blur-xl">
        <div className="from-primary via-primary to-accent absolute top-0 left-0 h-1.5 w-full rounded-t-xl bg-gradient-to-r" />

        <CardHeader className="mt-2 space-y-2 pb-6 text-center">
          <BrandMark className="mb-2" showWordmark={false} />
          <CardTitle className="text-3xl tracking-tight">ตั้งค่าระบบครั้งแรก</CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            สร้างบัญชีเจ้าของร้าน (Owner) เพื่อเริ่มต้นใช้งาน
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ToastFromSearchParams error={error} />

          <form action={bootstrapOwner} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">ชื่อ-นามสกุล</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="นายตัวอย่าง ทดสอบ"
                required
                className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">อีเมล</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="owner@shop.com"
                required
                className="focus:ring-primary/20 focus:border-primary h-11 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
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

            <div className="pt-2">
              <Button
                className="h-11 w-full text-base font-medium shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                type="submit"
              >
                สร้างบัญชี Owner
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
