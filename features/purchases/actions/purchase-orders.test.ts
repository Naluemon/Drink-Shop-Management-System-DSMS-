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
  createPurchaseOrder,
  addPurchaseOrderItem,
  removePurchaseOrderItem,
  receivePurchaseOrder,
  cancelPurchaseOrder,
} from "./purchase-orders";

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

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "po-1",
    branchId: "branch-1",
    supplierId: "sup-1",
    status: "pending",
    orderedAt: new Date("2026-08-06T10:00:00.000Z"),
    supplier: { id: "sup-1", name: "Makobrand.th" },
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb === "function") {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(cb as Promise<unknown>[]);
  });
});

describe("createPurchaseOrder", () => {
  it("records a created audit log entry", async () => {
    prismaMock.purchaseOrder.create.mockResolvedValue(orderRow() as never);

    await createPurchaseOrder({ supplierId: "sup-1" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "purchase_order" }),
      }),
    );
  });
});

describe("addPurchaseOrderItem / removePurchaseOrderItem", () => {
  it("addPurchaseOrderItem records a created entry", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(orderRow() as never);
    prismaMock.unitConversion.findFirst.mockResolvedValue({
      id: "uc-1",
      ingredientId: "ing-1",
      purchaseUnitName: "กล่อง",
      conversionFactor: 946,
    } as never);
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      id: "ing-1",
      name: "นมข้นจืด",
    } as never);
    prismaMock.purchaseOrderItem.create.mockResolvedValue({
      id: "item-1",
      ingredientId: "ing-1",
      purchaseUnitName: "กล่อง",
      quantity: { toString: () => "10" },
      unitPrice: { toString: () => "50" },
    } as never);

    await addPurchaseOrderItem("po-1", {
      ingredientId: "ing-1",
      purchaseUnitName: "กล่อง",
      quantity: 10,
      unitPrice: 50,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "purchase_order_item" }),
      }),
    );
  });

  it("removePurchaseOrderItem records a deleted entry", async () => {
    prismaMock.purchaseOrderItem.findUnique.mockResolvedValue({
      id: "item-1",
      purchaseOrder: orderRow(),
      ingredient: { id: "ing-1", name: "นมข้นจืด" },
    } as never);
    prismaMock.purchaseOrderItem.delete.mockResolvedValue({} as never);

    await removePurchaseOrderItem("item-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deleted", entityType: "purchase_order_item" }),
      }),
    );
  });
});

describe("receivePurchaseOrder / cancelPurchaseOrder", () => {
  it("receivePurchaseOrder records the PO's own status change but not per-ingredient stock entries", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(
      orderRow({
        items: [
          {
            id: "item-1",
            ingredientId: "ing-1",
            purchaseUnitName: "กล่อง",
            quantity: { toString: () => "10", valueOf: () => 10 },
            unitPrice: { toString: () => "50", valueOf: () => 50 },
          },
        ],
      }) as never,
    );
    prismaMock.unitConversion.findFirst.mockResolvedValue({
      conversionFactor: { valueOf: () => 946 },
    } as never);
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue({
      id: "ing-1",
      currentStockQty: { valueOf: () => 0 },
      costPerUnit: { valueOf: () => 0 },
    } as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);
    prismaMock.inventoryMovement.create.mockResolvedValue({ id: "mv-1" } as never);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as never);

    await receivePurchaseOrder("po-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "purchase_order",
          changes: [{ field: "status", oldValue: "pending", newValue: "received" }],
        }),
      }),
    );
  });

  it("cancelPurchaseOrder records the status change", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(orderRow() as never);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as never);

    await cancelPurchaseOrder("po-1");

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "purchase_order",
          changes: [{ field: "status", oldValue: "pending", newValue: "cancelled" }],
        }),
      }),
    );
  });
});
