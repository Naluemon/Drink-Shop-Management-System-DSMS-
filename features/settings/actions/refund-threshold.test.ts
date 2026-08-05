import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/default-branch", () => ({
  getOrCreateDefaultBranch: vi.fn(async () => ({ id: "branch-1" })),
}));

import { prisma } from "@/lib/prisma";
import { updateRefundApprovalThreshold } from "./refund-threshold";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "Actor",
    role,
    isActive: true,
    organizationId: "org-1",
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("updateRefundApprovalThreshold", () => {
  it("records an updated audit log entry with the old->new diff", async () => {
    prismaMock.taxSettings.findFirst.mockResolvedValue({
      id: "ts-1",
      refundApprovalThreshold: { toString: () => "500.00" },
    } as never);
    prismaMock.taxSettings.update.mockResolvedValue({} as never);

    const formData = new FormData();
    formData.set("threshold", "1000");

    await updateRefundApprovalThreshold(formData);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "tax_settings",
          changes: [{ field: "refundApprovalThreshold", oldValue: "500.00", newValue: "1000" }],
        }),
      }),
    );
  });
});
