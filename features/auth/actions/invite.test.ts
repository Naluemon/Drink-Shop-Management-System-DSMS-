import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §4/§11 — listPendingInvites/cancelInvite are new: they gate on
// the same "invite" permission as createInvite but additionally scope by
// organization and (for Manager) by "did I send this invite" — that scoping
// is the part a human wouldn't catch by clicking around as Owner.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { prisma } from "@/lib/prisma";
import { listPendingInvites, cancelInvite } from "./invite";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actor(id: string, role: string, organizationId = "org-1") {
  return { id, role, organizationId, fullName: "x", email: "x@b.com", isActive: true };
}

function invite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: "org-1",
    email: "new@shop.com",
    role: "cashier",
    invitedById: "u-owner",
    invitedBy: { fullName: "Owner Name" },
    token: "tok",
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
});

describe("listPendingInvites", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await listPendingInvites();

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.findMany).not.toHaveBeenCalled();
  });

  it("rejects a role with no invite permission on user_management", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-cashier" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-cashier", "cashier") as never);

    const result = await listPendingInvites();

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.findMany).not.toHaveBeenCalled();
  });

  it("scopes to invitedById for a Manager", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);
    prismaMock.userInvite.findMany.mockResolvedValue([invite({ invitedById: "u-mgr" })] as never);

    const result = await listPendingInvites();

    expect(prismaMock.userInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invitedById: "u-mgr" }),
      }),
    );
    expect(result.invites).toHaveLength(1);
  });

  it("does not scope by invitedById for an Owner (sees every invite in the org)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);
    prismaMock.userInvite.findMany.mockResolvedValue([invite()] as never);

    await listPendingInvites();

    const whereArg = prismaMock.userInvite.findMany.mock.calls[0][0]?.where;
    expect(whereArg).not.toHaveProperty("invitedById");
  });

  it("includes a usable invite link built from the token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);
    prismaMock.userInvite.findMany.mockResolvedValue([invite({ token: "abc123" })] as never);

    const result = await listPendingInvites();

    expect(result.invites?.[0].inviteLink).toContain("token=abc123");
  });
});

describe("cancelInvite", () => {
  it("rejects without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await cancelInvite("inv-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.delete).not.toHaveBeenCalled();
  });

  it("rejects a role with no invite permission on user_management", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-cashier" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-cashier", "cashier") as never);

    const result = await cancelInvite("inv-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.delete).not.toHaveBeenCalled();
  });

  it("rejects an invite from a different organization", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);
    prismaMock.userInvite.findUnique.mockResolvedValue(
      invite({ organizationId: "org-2" }) as never,
    );

    const result = await cancelInvite("inv-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.delete).not.toHaveBeenCalled();
  });

  it("rejects a Manager cancelling an invite they did not send", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);
    prismaMock.userInvite.findUnique.mockResolvedValue(
      invite({ invitedById: "u-other-mgr" }) as never,
    );

    const result = await cancelInvite("inv-1");

    expect(result.error).toBeTruthy();
    expect(prismaMock.userInvite.delete).not.toHaveBeenCalled();
  });

  it("lets a Manager cancel an invite they sent themselves", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-mgr" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-mgr", "manager") as never);
    prismaMock.userInvite.findUnique.mockResolvedValue(invite({ invitedById: "u-mgr" }) as never);
    prismaMock.userInvite.delete.mockResolvedValue({} as never);

    const result = await cancelInvite("inv-1");

    expect(result.success).toBe(true);
    expect(prismaMock.userInvite.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
  });

  it("lets an Owner cancel any invite in the org", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-owner" } } });
    prismaMock.user.findUnique.mockResolvedValue(actor("u-owner", "owner") as never);
    prismaMock.userInvite.findUnique.mockResolvedValue(invite({ invitedById: "u-mgr" }) as never);
    prismaMock.userInvite.delete.mockResolvedValue({} as never);

    const result = await cancelInvite("inv-1");

    expect(result.success).toBe(true);
  });
});
