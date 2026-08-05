import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §4 ("actions/: integration test ที่รวมการตรวจสิทธิ์ + validation")
// and §11 (RBAC matrix must match real behavior) — this module had no test
// coverage at all before, so RBAC drift here would only ever be caught by a
// human clicking around, not CI.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import { listUsers, toggleUserActive, updateUserRole } from "./manage-users";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actor(id: string, role: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    role,
    fullName: "x",
    email: "x@b.com",
    isActive: true,
    organizationId: "org-1",
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("listUsers", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await listUsers();

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  // SECURITY.md §1: Manager only has "invite" on user_management, not "view" —
  // must not be able to browse everyone's PII (D15).
  it("rejects a Manager (no view permission on user_management)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);

    const result = await listUsers();

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects Cashier/Employee/Accountant/Shift Supervisor the same way", async () => {
    for (const role of ["cashier", "employee", "accountant", "shift_supervisor"]) {
      getUser.mockResolvedValue({ data: { user: { id: `u-${role}` } } });
      prismaMock.user.findUnique.mockResolvedValue(actor(`u-${role}`, role) as never);

      const result = await listUsers();

      expect(result.error).toBeTruthy();
    }
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("returns the full user list for Owner", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);
    prismaMock.user.findMany.mockResolvedValue([
      actor("u-owner", "owner"),
      actor("u-2", "cashier"),
    ] as never);

    const result = await listUsers();

    expect(result.error).toBeUndefined();
    expect(result.users).toHaveLength(2);
  });
});

describe("toggleUserActive", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await toggleUserActive("u-2");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects a Manager (only Owner has update on user_management)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);

    const result = await toggleUserActive("u-2");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses to let Owner deactivate themselves (avoid self-lockout)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);

    const result = await toggleUserActive("u-owner");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("flips isActive for another user when called by Owner", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique
      .mockResolvedValueOnce(actor("u-owner", "owner") as never) // actor lookup
      .mockResolvedValueOnce(actor("u-2", "cashier", { isActive: true }) as never); // target lookup
    prismaMock.user.update.mockResolvedValue({} as never);

    const result = await toggleUserActive("u-2");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-2" },
      data: { isActive: false },
    });
    expect(result.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "user",
          entityId: "u-2",
          changes: [{ field: "isActive", oldValue: true, newValue: false }],
        }),
      }),
    );
  });
});

describe("updateUserRole", () => {
  it("rejects a Manager (only Owner has update on user_management)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);

    const result = await updateUserRole("u-2", "manager");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses to let Owner change their own role (avoid self-lockout)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);

    const result = await updateUserRole("u-owner", "cashier");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid role string", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);

    const result = await updateUserRole("u-2", "superadmin");

    expect(result.error).toBeTruthy();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates the target's role when called by Owner with a valid role", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique
      .mockResolvedValueOnce(actor("u-owner", "owner") as never)
      .mockResolvedValueOnce(actor("u-2", "cashier") as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const result = await updateUserRole("u-2", "shift_supervisor");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-2" },
      data: { role: "shift_supervisor" },
    });
    expect(result.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "user",
          entityId: "u-2",
          changes: [{ field: "role", oldValue: "cashier", newValue: "shift_supervisor" }],
        }),
      }),
    );
  });
});
