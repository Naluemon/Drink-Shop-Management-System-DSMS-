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
import {
  createModifierGroup,
  updateModifierGroup,
  softDeleteModifierGroup,
  addModifier,
  removeModifier,
} from "./modifier-groups";

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

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    branchId: "branch-1",
    name: "Topping",
    selectionType: "single",
    isRequired: false,
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

describe("createModifierGroup", () => {
  it("records a created audit log entry", async () => {
    prismaMock.modifierGroup.findFirst.mockResolvedValue(null as never);
    prismaMock.modifierGroup.create.mockResolvedValue(groupRow() as never);

    await createModifierGroup({ name: "Topping", selectionType: "single", isRequired: false });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "modifier_group" }),
      }),
    );
  });
});

describe("updateModifierGroup", () => {
  it("records an updated entry when isRequired changes", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow({ isRequired: false }) as never);
    prismaMock.modifierGroup.findFirst.mockResolvedValue(null as never);
    prismaMock.modifierGroup.update.mockResolvedValue({} as never);

    await updateModifierGroup("group-1", {
      name: "Topping",
      selectionType: "single",
      isRequired: true,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          changes: expect.arrayContaining([
            { field: "isRequired", oldValue: false, newValue: true },
          ]),
        }),
      }),
    );
  });
});

describe("softDeleteModifierGroup", () => {
  it("records a deleted entry", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow() as never);
    prismaMock.modifierGroup.update.mockResolvedValue({} as never);

    await softDeleteModifierGroup("group-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "modifier_group" }),
      }),
    );
  });
});

describe("addModifier / removeModifier", () => {
  it("addModifier records a created entry", async () => {
    prismaMock.modifierGroup.findUnique.mockResolvedValue(groupRow() as never);
    prismaMock.modifier.findFirst.mockResolvedValue(null as never);
    prismaMock.modifier.create.mockResolvedValue({
      id: "mod-1",
      name: "ไข่มุก",
      ingredientId: null,
      ingredientQuantity: null,
      priceDelta: { toString: () => "5" },
      ingredient: null,
    } as never);

    await addModifier("group-1", { name: "ไข่มุก", ingredientId: "", priceDelta: 5 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "modifier" }),
      }),
    );
  });

  it("removeModifier records a deleted entry", async () => {
    prismaMock.modifier.findUnique.mockResolvedValue({
      id: "mod-1",
      name: "ไข่มุก",
      modifierGroup: groupRow(),
    } as never);
    prismaMock.modifier.update.mockResolvedValue({} as never);

    await removeModifier("mod-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "modifier" }),
      }),
    );
  });
});
