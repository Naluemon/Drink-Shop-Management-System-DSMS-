import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// TESTING.md §3 TC-VOID-01 / TC-REFUND-01 / TC-REFUND-02 — DECISIONS.md D5/D14.
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

// A fixed "now" well within the business day that started at 05:00 today,
// Asia/Bangkok — keeps the void's "same business day" check trivially true
// without needing to mock lib/business-day's already-tested pure logic.
vi.mock("@/lib/settings", () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({
    timezone: "Asia/Bangkok",
    businessDayStartHour: 5,
  })),
  getOrCreateTaxSettings: vi.fn(async () => ({
    vatMode: "inclusive",
    vatRate: 7,
    refundApprovalThreshold: 500,
  })),
}));

import { prisma } from "@/lib/prisma";
import {
  voidTransaction,
  requestRefund,
  approveRefund,
  rejectRefund,
  listRecentTransactions,
  getTransactionDetail,
} from "./void-refund";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(overrides: Partial<{ id: string; role: string }> = {}) {
  return {
    id: overrides.id ?? "cashier-1",
    email: "a@b.com",
    fullName: "A",
    role: overrides.role ?? "cashier",
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// TESTING.md §2.2/§2.3 reference dataset: Size M ชาไทยเย็น (35.00) + ไข่มุก
// modifier (+10.00) = 45.00 บาท total (TC-MOD-01), consuming ผงชาไทย 20g,
// นมสด UHT 60ml, น้ำเชื่อม 30ml, แก้ว+ฝา+หลอด 1 ชุด, ไข่มุก 30g.
const NOW = new Date();
const originalSale = {
  id: "sale-1",
  branchId: "branch-1",
  cashierId: "cashier-1",
  paymentMethod: "cash",
  subtotal: 45,
  discountAmount: 0,
  roundingAdjustment: 0,
  totalAmount: 45,
  vatModeSnapshot: "inclusive",
  vatRateSnapshot: 7,
  taxInvoiceNumber: 5, // a real VAT-registered sale already consumed invoice #5
  reversalOfId: null,
  voidReason: null,
  approvedBy: null,
  createdAt: NOW,
  createdBy: "cashier-1",
  items: [
    {
      id: "item-1",
      salesTransactionId: "sale-1",
      menuId: "menu-1",
      menuVariantId: null,
      quantity: 1,
      unitPrice: 45,
      costAtSaleTime: 18.33,
      discountAmount: 0,
      reversedQuantity: 0,
      createdAt: NOW,
      modifiers: [
        {
          id: "mod-1",
          salesTransactionItemId: "item-1",
          modifierId: "modifier-pearl",
          modifierNameSnapshot: "ไข่มุก",
          priceDeltaSnapshot: 10,
          ingredientCostSnapshot: 2.1,
          createdAt: NOW,
        },
      ],
    },
  ],
};

const originalStockOutMovements = [
  {
    id: "mv-1",
    branchId: "branch-1",
    ingredientId: "ing-tea",
    movementType: "stock_out",
    quantity: 20,
  },
  {
    id: "mv-2",
    branchId: "branch-1",
    ingredientId: "ing-milk",
    movementType: "stock_out",
    quantity: 60,
  },
  {
    id: "mv-3",
    branchId: "branch-1",
    ingredientId: "ing-syrup",
    movementType: "stock_out",
    quantity: 30,
  },
  {
    id: "mv-4",
    branchId: "branch-1",
    ingredientId: "ing-cup",
    movementType: "stock_out",
    quantity: 1,
  },
  {
    id: "mv-5",
    branchId: "branch-1",
    ingredientId: "ing-pearl",
    movementType: "stock_out",
    quantity: 30,
  },
];

function setUpReversalTransaction() {
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
  prismaMock.salesTransaction.findUniqueOrThrow.mockResolvedValue(originalSale as never);
  prismaMock.salesTransaction.create.mockResolvedValue({ id: "reversal-1" } as never);
  prismaMock.salesTransactionItem.create.mockResolvedValue({ id: "reversal-item-1" } as never);
  prismaMock.salesTransactionItemModifier.create.mockResolvedValue({} as never);
  prismaMock.inventoryMovement.findMany.mockResolvedValue(originalStockOutMovements as never);
  prismaMock.inventoryMovement.create.mockResolvedValue({} as never);
  prismaMock.ingredient.update.mockResolvedValue({} as never);
}

describe("voidTransaction (TC-VOID-01)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    prismaMock.auditLog.create.mockResolvedValue({} as never);
  });

  it("lets the cashier who made the sale void it within the same business day, restoring every ingredient consumed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(originalSale as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null); // not already voided/refunded
    setUpReversalTransaction();

    const result = await voidTransaction("sale-1", "ลูกค้าเปลี่ยนใจ");

    expect(result.success).toBe(true);

    // The reversal mirrors the original sale's total exactly (D5 — the sign
    // is implied by reversalOfId, not the stored amount)
    expect(prismaMock.salesTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 45,
          reversalOfId: "sale-1",
          voidReason: "ลูกค้าเปลี่ยนใจ",
        }),
      }),
    );

    // D16: void must NEVER consume a new tax invoice number — the reversal
    // row gets no taxInvoiceNumber of its own (the original's #5 stays intact)
    const reversalCreateData = prismaMock.salesTransaction.create.mock.calls[0][0].data;
    expect(reversalCreateData).not.toHaveProperty("taxInvoiceNumber");
    expect(prismaMock.salesTransaction.aggregate).not.toHaveBeenCalled();

    // Every ingredient consumed by the sale gets its stock restored
    const restoredIngredientIds = prismaMock.ingredient.update.mock.calls.map((c) => c[0].where.id);
    expect(restoredIngredientIds.sort()).toEqual(
      ["ing-cup", "ing-milk", "ing-pearl", "ing-syrup", "ing-tea"].sort(),
    );
    const teaRestore = prismaMock.ingredient.update.mock.calls.find(
      (c) => c[0].where.id === "ing-tea",
    );
    expect(teaRestore?.[0].data).toEqual({ currentStockQty: { increment: 20 } });
    const pearlRestore = prismaMock.ingredient.update.mock.calls.find(
      (c) => c[0].where.id === "ing-pearl",
    );
    expect(pearlRestore?.[0].data).toEqual({ currentStockQty: { increment: 30 } });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "sale_void" }),
      }),
    );
  });

  it("refuses to let a Cashier void someone else's sale", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-2" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-2", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(originalSale as never); // cashierId: "cashier-1"
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null);

    const result = await voidTransaction("sale-1", "ลูกค้าเปลี่ยนใจ");

    expect(result.error).toBeTruthy();
    expect(prismaMock.salesTransaction.create).not.toHaveBeenCalled();
  });

  it("lets a Manager void any cashier's sale", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(originalSale as never); // cashierId: "cashier-1"
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null);
    setUpReversalTransaction();

    const result = await voidTransaction("sale-1", "แก้ไขข้อผิดพลาด");

    expect(result.success).toBe(true);
  });

  it("refuses to void a transaction already voided/refunded", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(originalSale as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue({ id: "already-reversed" } as never);

    const result = await voidTransaction("sale-1", "ลูกค้าเปลี่ยนใจ");

    expect(result.error).toBeTruthy();
    expect(prismaMock.salesTransaction.create).not.toHaveBeenCalled();
  });
});

describe("requestRefund", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    prismaMock.auditLog.create.mockResolvedValue({} as never);
  });

  it("records a created audit log entry for the refund request", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(originalSale as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null);
    prismaMock.refundRequest.findFirst.mockResolvedValue(null);
    prismaMock.refundRequest.create.mockResolvedValue({ id: "req-1" } as never);

    const result = await requestRefund("sale-1", "ลูกค้าขอคืนเงิน");

    expect(result.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", entityType: "refund_request" }),
      }),
    );
  });
});

describe("approveRefund (TC-REFUND-01 / TC-REFUND-02, D5/D14)", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    prismaMock.auditLog.create.mockResolvedValue({} as never);
  });

  it("TC-REFUND-01: Shift Supervisor approves a refund at/under the 500.00 threshold immediately", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "shift-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "shift-1", role: "shift_supervisor" }) as never,
    );
    prismaMock.refundRequest.findUnique.mockResolvedValue({
      id: "req-1",
      salesTransactionId: "sale-1",
      status: "pending",
      salesTransaction: { ...originalSale, totalAmount: 45 },
    } as never);
    setUpReversalTransaction();
    prismaMock.refundRequest.update.mockResolvedValue({} as never);

    const result = await approveRefund("req-1");

    expect(result.success).toBe(true);
    expect(prismaMock.salesTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvedBy: "shift-1" }) }),
    );
    expect(prismaMock.refundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "refund_request",
          changes: [{ field: "status", oldValue: "pending", newValue: "approved" }],
        }),
      }),
    );
  });

  it("TC-REFUND-02: Shift Supervisor is FORBIDDEN from approving a refund over the threshold (800.00 > 500.00)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "shift-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "shift-1", role: "shift_supervisor" }) as never,
    );
    prismaMock.refundRequest.findUnique.mockResolvedValue({
      id: "req-2",
      salesTransactionId: "sale-2",
      status: "pending",
      salesTransaction: { ...originalSale, id: "sale-2", totalAmount: 800 },
    } as never);

    const result = await approveRefund("req-2");

    expect(result.error).toBeTruthy();
    expect(prismaMock.salesTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.refundRequest.update).not.toHaveBeenCalled();
  });

  it("lets Manager approve a refund over the threshold that Shift Supervisor cannot", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.refundRequest.findUnique.mockResolvedValue({
      id: "req-2",
      salesTransactionId: "sale-2",
      status: "pending",
      salesTransaction: { ...originalSale, id: "sale-2", totalAmount: 800 },
    } as never);
    setUpReversalTransaction();
    prismaMock.refundRequest.update.mockResolvedValue({} as never);

    const result = await approveRefund("req-2");

    expect(result.success).toBe(true);
  });

  it("refuses to act on a refund request that has already been decided", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.refundRequest.findUnique.mockResolvedValue({
      id: "req-3",
      status: "approved",
      salesTransaction: originalSale,
    } as never);

    const result = await approveRefund("req-3");

    expect(result.error).toBeTruthy();
    expect(prismaMock.salesTransaction.create).not.toHaveBeenCalled();
  });
});

describe("rejectRefund", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    prismaMock.auditLog.create.mockResolvedValue({} as never);
  });

  it("marks a pending request as rejected without creating any reversal", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.refundRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
      salesTransactionId: "sale-1",
      salesTransaction: originalSale,
    } as never);
    prismaMock.refundRequest.update.mockResolvedValue({} as never);

    const result = await rejectRefund("req-1");

    expect(result.success).toBe(true);
    expect(prismaMock.refundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "rejected" }) }),
    );
    expect(prismaMock.salesTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "refund_request",
          changes: [{ field: "status", oldValue: "pending", newValue: "rejected" }],
        }),
      }),
    );
  });
});

// The register's "รายการขายล่าสุด" list used to just take(30) with no
// pagination at all — this covers the DEFAULT_PAGE_SIZE-based skip/take math
// and the page/totalPages/total metadata the UI's PaginationControls needs.
describe("listRecentTransactions", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
    prismaMock.salesTransaction.findMany.mockResolvedValue([] as never);
    prismaMock.refundRequest.findMany.mockResolvedValue([] as never);
  });

  it("requests page 1 with a 0 skip by default", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "owner-1", role: "owner" }) as never,
    );
    prismaMock.salesTransaction.count.mockResolvedValue(45 as never);

    const result = await listRecentTransactions();

    expect(prismaMock.salesTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result.page).toBe(1);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
  });

  it("skips a full page's worth of rows on page 2", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "owner-1", role: "owner" }) as never,
    );
    prismaMock.salesTransaction.count.mockResolvedValue(45 as never);

    const result = await listRecentTransactions(2);

    expect(prismaMock.salesTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(result.page).toBe(2);
  });

  it("scopes a Cashier to their own sales only, same as before pagination", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.count.mockResolvedValue(0 as never);

    await listRecentTransactions();

    expect(prismaMock.salesTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reversalOfId: null, cashierId: "cashier-1" } }),
    );
  });
});

// Row-click detail view for the "รายการขายล่าสุด" table — needs the item's
// menu/variant names (unlike listRecentTransactions, which only needs a count).
describe("getTransactionDetail", () => {
  const saleWithMenu = {
    ...originalSale,
    items: [
      {
        ...originalSale.items[0],
        menu: { id: "menu-1", name: "ชาไทยเย็น" },
        menuVariant: null,
      },
    ],
  };

  beforeEach(() => {
    mockReset(prismaMock);
    getUser.mockReset();
  });

  it("returns item detail with menu names for the cashier who made the sale", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(saleWithMenu as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null); // no reversal
    prismaMock.refundRequest.findFirst.mockResolvedValue(null);

    const result = await getTransactionDetail("sale-1");

    expect(result.error).toBeUndefined();
    expect(result.transaction?.items).toEqual([
      expect.objectContaining({
        name: "ชาไทยเย็น",
        quantity: 1,
        unitPrice: "45",
        modifiers: [expect.objectContaining({ name: "ไข่มุก", priceDelta: "10" })],
      }),
    ]);
    expect(result.transaction?.isVoided).toBe(false);
  });

  it("includes the variant name in parentheses when the item has one", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-1", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue({
      ...saleWithMenu,
      items: [{ ...saleWithMenu.items[0], menuVariant: { id: "v-1", name: "ไซส์ M" } }],
    } as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null);
    prismaMock.refundRequest.findFirst.mockResolvedValue(null);

    const result = await getTransactionDetail("sale-1");

    expect(result.transaction?.items[0].name).toBe("ชาไทยเย็น (ไซส์ M)");
  });

  it("lets Owner/Manager view any cashier's sale", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(saleWithMenu as never); // cashierId: "cashier-1"
    prismaMock.salesTransaction.findFirst.mockResolvedValue(null);
    prismaMock.refundRequest.findFirst.mockResolvedValue(null);

    const result = await getTransactionDetail("sale-1");

    expect(result.error).toBeUndefined();
  });

  it("refuses a Cashier viewing someone else's sale", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "cashier-2" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "cashier-2", role: "cashier" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(saleWithMenu as never); // cashierId: "cashier-1"

    const result = await getTransactionDetail("sale-1");

    expect(result.error).toBeTruthy();
    expect(result.transaction).toBeUndefined();
  });

  it("reports isVoided + the void reason read off the reversal row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(saleWithMenu as never);
    prismaMock.salesTransaction.findFirst.mockResolvedValue({
      id: "reversal-1",
      voidReason: "ลูกค้าเปลี่ยนใจ",
    } as never);
    prismaMock.refundRequest.findFirst.mockResolvedValue(null);

    const result = await getTransactionDetail("sale-1");

    expect(result.transaction?.isVoided).toBe(true);
    expect(result.transaction?.voidReason).toBe("ลูกค้าเปลี่ยนใจ");
  });

  it("returns an error when the transaction doesn't exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } } });
    prismaMock.user.findUnique.mockResolvedValue(
      actorRow({ id: "manager-1", role: "manager" }) as never,
    );
    prismaMock.salesTransaction.findUnique.mockResolvedValue(null);

    const result = await getTransactionDetail("missing");

    expect(result.error).toBeTruthy();
  });
});
