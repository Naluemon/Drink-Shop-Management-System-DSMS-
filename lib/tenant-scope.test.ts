import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActorWithOrg, withOrgScope } from "./tenant-scope";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("getActorWithOrg", () => {
  it("returns null when not logged in", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    });

    const result = await getActorWithOrg();
    expect(result).toBeNull();
  });

  it("resolves actor, organizationId, and branchId when logged in", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
      email: "a@b.com",
      fullName: "A",
      role: "owner",
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    prismaMock.branch.findFirst.mockResolvedValue({
      id: "branch-1",
      organizationId: "org-1",
      name: "สาขาหลัก",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getActorWithOrg();
    expect(result).toEqual({
      actor: expect.objectContaining({ id: "user-1", organizationId: "org-1" }),
      organizationId: "org-1",
      branchId: "branch-1",
    });
  });

  it("returns null if the user's organization has no branch yet", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
    } as never);
    prismaMock.branch.findFirst.mockResolvedValue(null);

    const result = await getActorWithOrg();
    expect(result).toBeNull();
  });
});

describe("withOrgScope", () => {
  it("sets the session org before running the callback, inside a transaction", async () => {
    const txMock = mockDeep<PrismaClient>();
    prismaMock.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) =>
      cb(txMock)) as never);

    const callback = vi.fn().mockResolvedValue("result");
    const result = await withOrgScope("org-1", callback);

    expect(txMock.$executeRaw).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(txMock);
    expect(result).toBe("result");
  });
});
