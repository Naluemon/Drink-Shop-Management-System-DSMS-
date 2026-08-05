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
import { createExpenseCategory, updateExpenseCategory, softDeleteExpenseCategory } from "./expense";

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

function categoryRow(overrides: Record<string, unknown> = {}) {
  return { id: "cat-1", branchId: "branch-1", name: "ค่าเช่า", ...overrides };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe("createExpenseCategory", () => {
  it("records a created audit log entry", async () => {
    prismaMock.expenseCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.expenseCategory.create.mockResolvedValue(categoryRow() as never);

    await createExpenseCategory({ name: "ค่าเช่า" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "expense_category" }),
      }),
    );
  });
});

describe("updateExpenseCategory", () => {
  it("records an updated entry when the name changes", async () => {
    prismaMock.expenseCategory.findUnique.mockResolvedValue(categoryRow() as never);
    prismaMock.expenseCategory.findFirst.mockResolvedValue(null as never);
    prismaMock.expenseCategory.update.mockResolvedValue({} as never);

    await updateExpenseCategory("cat-1", { name: "ค่าเช่าตึก" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: [{ field: "name", oldValue: "ค่าเช่า", newValue: "ค่าเช่าตึก" }],
        }),
      }),
    );
  });
});

describe("softDeleteExpenseCategory", () => {
  it("records a deleted entry", async () => {
    prismaMock.expenseCategory.findUnique.mockResolvedValue(categoryRow() as never);
    prismaMock.expenseCategory.update.mockResolvedValue({} as never);

    await softDeleteExpenseCategory("cat-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "expense_category" }),
      }),
    );
  });
});
