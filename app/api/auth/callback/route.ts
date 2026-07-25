import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Only ever redirect to a path on this same app — reject absolute URLs,
// protocol-relative ("//evil.com"), or anything not starting with a single
// "/", so a crafted `?next=` query param can't be used as an open redirect.
export function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data: authData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && authData.user) {
      // DECISIONS.md D6: ตรวจสอบ invite record และ bootstrap logic
      const dbUser = await prisma.user.findUnique({
        where: { id: authData.user.id },
      });

      // กรณี 1: มี user ในระบบแล้ว → อนุญาตให้เข้า
      if (dbUser) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // กรณี 2: ยังไม่มี user ในระบบ → ตรวจสอบว่าเป็น bootstrap หรือมี invite
      // Bootstrap check+create happens inside one Serializable transaction —
      // without this, a concurrent request (e.g. the manual /setup form
      // racing this Google sign-in) could also read ownerCount === 0 and
      // both end up "owner" (D6 allows exactly one bootstrap owner). If we
      // lose that race, this just falls through to the normal invite check
      // below instead of failing — exactly what would've happened if this
      // request had simply been a moment slower.
      let becameBootstrapOwner = false;
      try {
        await prisma.$transaction(
          async (tx) => {
            const ownerCount = await tx.user.count({ where: { role: "owner" } });
            if (ownerCount > 0) {
              throw new Error("NOT_BOOTSTRAP");
            }
            await tx.user.create({
              data: {
                id: authData.user.id,
                email: authData.user.email!,
                fullName:
                  authData.user.user_metadata?.full_name || authData.user.email!.split("@")[0],
                role: "owner",
                isActive: true,
              },
            });
          },
          { isolationLevel: "Serializable" },
        );
        becameBootstrapOwner = true;
      } catch {
        becameBootstrapOwner = false;
      }

      if (becameBootstrapOwner) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // 2.2 ไม่ใช่ bootstrap → ต้องมี invite record
      const invite = await prisma.userInvite.findFirst({
        where: {
          email: authData.user.email!,
          acceptedAt: null,
          expiresAt: { gt: new Date() }, // invite ยังไม่หมดอายุ
        },
      });

      if (!invite) {
        await supabase.auth.signOut();
        return NextResponse.redirect(
          `${origin}/login?error=อีเมลนี้ยังไม่ได้รับเชิญให้เข้าใช้งานระบบ`,
        );
      }

      // 2.3 มี invite → สร้าง user ตาม role ที่กำหนด
      try {
        await prisma.user.create({
          data: {
            id: authData.user.id,
            email: authData.user.email!,
            fullName: authData.user.user_metadata?.full_name || authData.user.email!.split("@")[0],
            role: invite.role,
            isActive: true,
          },
        });

        // อัปเดต invite ว่าถูกยอมรับแล้ว
        await prisma.userInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });

        return NextResponse.redirect(`${origin}${next}`);
      } catch {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=การสร้างบัญชีล้มเหลว`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=การเข้าสู่ระบบล้มเหลว`);
}
