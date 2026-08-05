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
import { createSupplier, updateSupplier, softDeleteSupplier } from "./suppliers";

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

function supplierRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sup-1",
    branchId: "branch-1",
    name: "Makobrand.th",
    contactInfo: null,
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

describe("createSupplier", () => {
  it("records a created audit log entry", async () => {
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.create.mockResolvedValue(supplierRow() as never);

    await createSupplier({ name: "Makobrand.th", contactInfo: "" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "supplier" }),
      }),
    );
  });
});

describe("updateSupplier", () => {
  it("records an updated entry when contactInfo changes", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(supplierRow({ contactInfo: null }) as never);
    prismaMock.supplier.findFirst.mockResolvedValue(null as never);
    prismaMock.supplier.update.mockResolvedValue({} as never);

    await updateSupplier("sup-1", { name: "Makobrand.th", contactInfo: "080-000-0000" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([
            { field: "contactInfo", oldValue: null, newValue: "080-000-0000" },
          ]),
        }),
      }),
    );
  });
});

describe("softDeleteSupplier", () => {
  it("records a deleted entry", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(supplierRow() as never);
    prismaMock.supplier.update.mockResolvedValue({} as never);

    await softDeleteSupplier("sup-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "supplier" }),
      }),
    );
  });
});
