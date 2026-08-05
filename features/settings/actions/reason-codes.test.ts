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
import { createReasonCode, updateReasonCode, softDeleteReasonCode } from "./reason-codes";

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

function reasonCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rc-1",
    code: "spoiled",
    label: "ของเสีย/หมดอายุ",
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createReasonCode", () => {
  it("records a created audit log entry", async () => {
    prismaMock.reasonCode.findUnique.mockResolvedValue(null as never);
    prismaMock.reasonCode.create.mockResolvedValue(reasonCodeRow() as never);

    await createReasonCode({ code: "spoiled", label: "ของเสีย/หมดอายุ" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "reason_code" }),
      }),
    );
  });
});

describe("updateReasonCode", () => {
  it("records an updated entry when isActive changes", async () => {
    prismaMock.reasonCode.findUnique.mockResolvedValue(reasonCodeRow({ isActive: true }) as never);
    prismaMock.reasonCode.update.mockResolvedValue({} as never);

    await updateReasonCode("rc-1", { label: "ของเสีย/หมดอายุ", isActive: false });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: [{ field: "isActive", oldValue: true, newValue: false }],
        }),
      }),
    );
  });
});

describe("softDeleteReasonCode", () => {
  it("records a deleted entry", async () => {
    prismaMock.reasonCode.findUnique.mockResolvedValue(reasonCodeRow() as never);
    prismaMock.reasonCode.update.mockResolvedValue({} as never);

    await softDeleteReasonCode("rc-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "reason_code" }),
      }),
    );
  });
});
