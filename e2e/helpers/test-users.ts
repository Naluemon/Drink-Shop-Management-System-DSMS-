import "dotenv/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";

// E2E test users are disposable — created fresh per test run and deleted in
// afterAll. The @e2e-test.local domain marks them clearly as never-real
// accounts (Supabase doesn't actually send mail to them; email_confirm:true
// skips verification entirely).
const TEST_PASSWORD = "E2eTestPass1!";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

let counter = 0;

export async function createTestUser(role: UserRole): Promise<TestUser> {
  counter += 1;
  const email = `e2e-${role}-${Date.now()}-${counter}@e2e-test.local`;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create Supabase Auth test user: ${error?.message}`);
  }

  // Phase A (multi-tenant-phase-a-isolation): exactly one Organization
  // exists until Phase B's self-service signup.
  const organization = await prisma.organization.findFirstOrThrow();

  await prisma.user.create({
    data: {
      id: data.user.id,
      organizationId: organization.id,
      email,
      fullName: `E2E Test ${role}`,
      role,
      isActive: true,
    },
  });

  return { id: data.user.id, email, password: TEST_PASSWORD, role };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  const admin = createAdminClient();
  // UserInvite.invitedById has no cascade delete — a test user who sent any
  // invites (see e2e/invite-flow.spec.ts) would otherwise leave this delete
  // failing on a foreign key violation.
  await prisma.userInvite.deleteMany({ where: { invitedById: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await admin.auth.admin.deleteUser(user.id).catch(() => {
    // best-effort — don't fail teardown if already gone
  });
}

// For users created through the real invite-accept flow (not createTestUser)
// — the public.users row (and its Supabase Auth counterpart) only exists
// after acceptInvite() runs client-side, so there's no id to track up front.
export async function deleteUserByEmail(email: string): Promise<void> {
  const admin = createAdminClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.userInvite.deleteMany({ where: { invitedById: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await admin.auth.admin.deleteUser(user.id).catch(() => {
    // best-effort — don't fail teardown if already gone
  });
}
