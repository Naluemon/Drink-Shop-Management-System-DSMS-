"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function checkBootstrapStatus() {
  const ownerCount = await prisma.user.count({
    where: { role: "owner" },
  });
  return ownerCount === 0;
}

export async function bootstrapOwner(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  if (!email || !password || !fullName) {
    redirect(`/setup?error=${encodeURIComponent("กรุณากรอกข้อมูลให้ครบถ้วน")}`);
  }

  const isBootstrap = await checkBootstrapStatus();
  if (!isBootstrap) {
    redirect(
      `/setup?error=${encodeURIComponent("ระบบได้ทำการสร้าง Owner ไปแล้ว ไม่สามารถสร้างซ้ำได้")}`,
    );
  }

  const supabase = await createClient();

  // 1. Sign up the user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (authError || !authData.user) {
    redirect(`/setup?error=${encodeURIComponent(authError?.message || "การสร้างบัญชีล้มเหลว")}`);
  }

  // 2. Insert into Prisma (public.users) — re-check owner count *inside* a
  // Serializable transaction, not just before signup. Without this, two
  // concurrent first-signup requests could both pass the earlier check and
  // both end up with role "owner" (D6 requires exactly one bootstrap owner).
  // Postgres aborts one side with a serialization conflict, which we catch.
  try {
    await prisma.$transaction(
      async (tx) => {
        const ownerCount = await tx.user.count({ where: { role: "owner" } });
        if (ownerCount > 0) {
          throw new Error("OWNER_ALREADY_EXISTS");
        }
        await tx.user.create({
          data: {
            id: authData.user!.id,
            email,
            fullName,
            role: "owner",
            isActive: true,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch {
    // Either we lost the race (someone else just became owner) or a genuine
    // DB error — either way this Supabase Auth account must not be left
    // usable without a matching public.users row, so clean it up.
    try {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(authData.user.id);
    } catch {
      // best-effort cleanup only — do not block the user-facing error on this
    }
    redirect(
      `/setup?error=${encodeURIComponent("ระบบได้ทำการสร้าง Owner ไปแล้ว ไม่สามารถสร้างซ้ำได้ กรุณาเข้าสู่ระบบ")}`,
    );
  }

  redirect("/dashboard");
}
