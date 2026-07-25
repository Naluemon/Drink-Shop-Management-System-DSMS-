import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// DECISIONS.md D6: first successful signup while no Owner exists becomes
// Owner (once); every signup after that must go through an invite. This is
// one of the 5 decisions the docs flag as security-impacting, so it gets a
// real integration test rather than relying on manual QA alone.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const signUp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signUp } })),
}));

const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin: { deleteUser } } })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { prisma } from "@/lib/prisma";
import { checkBootstrapStatus, bootstrapOwner } from "./bootstrap";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("checkBootstrapStatus", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("is true when no Owner exists yet", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    expect(await checkBootstrapStatus()).toBe(true);
  });

  it("is false once an Owner exists", async () => {
    prismaMock.user.count.mockResolvedValue(1);
    expect(await checkBootstrapStatus()).toBe(false);
  });
});

describe("bootstrapOwner (D6)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    signUp.mockReset();
    deleteUser.mockReset();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock),
    );
  });

  it("rejects immediately if an Owner already exists — never calls Supabase signUp", async () => {
    prismaMock.user.count.mockResolvedValue(1); // an Owner already exists

    await expect(
      bootstrapOwner(formData({ email: "a@b.com", password: "password1", fullName: "A" })),
    ).rejects.toThrow(/^REDIRECT:\/setup\?error=/);

    expect(signUp).not.toHaveBeenCalled();
  });

  it("creates exactly one Owner on first signup", async () => {
    prismaMock.user.count.mockResolvedValue(0); // pre-check: no Owner yet
    // Phase A (multi-tenant-phase-a-isolation): exactly one Organization
    // exists, resolved inside the bootstrap transaction.
    prismaMock.organization.findFirstOrThrow.mockResolvedValue({
      id: "org-1",
      name: "ร้านของคุณ",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    signUp.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });

    await expect(
      bootstrapOwner(
        formData({ email: "owner@shop.com", password: "password1", fullName: "Owner" }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        id: "auth-user-1",
        organizationId: "org-1",
        email: "owner@shop.com",
        fullName: "Owner",
        role: "owner",
        isActive: true,
      },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("loses a concurrent bootstrap race safely: cleans up the orphaned Supabase Auth account and rejects", async () => {
    // Pre-check passes (no Owner yet)...
    prismaMock.user.count.mockResolvedValueOnce(0);
    signUp.mockResolvedValue({ data: { user: { id: "auth-user-2" } }, error: null });
    // ...but by the time the Serializable transaction runs, another request won the race
    prismaMock.user.count.mockResolvedValueOnce(1);

    await expect(
      bootstrapOwner(
        formData({ email: "loser@shop.com", password: "password1", fullName: "Loser" }),
      ),
    ).rejects.toThrow(/^REDIRECT:\/setup\?error=/);

    expect(prismaMock.user.create).not.toHaveBeenCalled();
    // The now-orphaned Supabase Auth account (no matching public.users row) must be cleaned up
    expect(deleteUser).toHaveBeenCalledWith("auth-user-2");
  });
});
