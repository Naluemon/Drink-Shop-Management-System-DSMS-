import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// DECISIONS.md D15 (PDPA): users can view/edit only their own personal data —
// getProfile/updateProfile always key off the caller's own session, never an
// id supplied by the client.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
const updateUser = vi.fn();
const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser, updateUser, signInWithPassword },
  })),
}));

import { prisma } from "@/lib/prisma";
import { getProfile, updateProfile, changePassword } from "./profile";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("getProfile (D15)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
  });

  it("returns an error when there is no session, without touching the database", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await getProfile();

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("looks up only the caller's own row, keyed by their session id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      fullName: "A",
      role: "cashier",
      isActive: true,
      createdAt: new Date(),
    } as never);

    const result = await getProfile();

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(result.user?.id).toBe("user-1");
  });
});

describe("updateProfile (D15)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    updateUser.mockReset();
  });

  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await updateProfile(formData({ fullName: "New Name", email: "new@b.com" }));

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates only the caller's own row (id comes from the session, not the form)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "old@b.com" } } });
    prismaMock.user.findFirst.mockResolvedValue(null); // email not taken by anyone else
    prismaMock.user.update.mockResolvedValue({} as never);
    updateUser.mockResolvedValue({ error: null });

    const result = await updateProfile(formData({ fullName: "New Name", email: "new@b.com" }));

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { fullName: "New Name", email: "new@b.com" },
    });
    expect(result.success).toBe(true);
  });

  it("refuses to change to an email already used by a different user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "old@b.com" } } });
    prismaMock.user.findFirst.mockResolvedValue({ id: "someone-else" } as never);

    const result = await updateProfile(formData({ fullName: "New Name", email: "taken@b.com" }));

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("changePassword (D15/D13)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    signInWithPassword.mockReset();
  });

  it("requires the current password to verify identity before changing it", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@b.com" } } });
    signInWithPassword.mockResolvedValue({ error: { message: "invalid" } });

    const result = await changePassword(
      formData({
        currentPassword: "wrongpass1",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );

    expect(result.error).toBeTruthy();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "wrongpass1" });
  });

  it("enforces the D13 minimum password policy (8 chars + a digit)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@b.com" } } });

    const result = await changePassword(
      formData({ currentPassword: "current1", newPassword: "short", confirmPassword: "short" }),
    );

    expect(result.error).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
