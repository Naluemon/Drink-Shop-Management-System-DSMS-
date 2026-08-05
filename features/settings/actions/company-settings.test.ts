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
  updateCompanyInfo,
  updateTaxSettings,
  updateReceiptSettings,
  updateBusinessHours,
  updateStockDeficitPolicy,
  updateIngredientDeficitOverride,
} from "./company-settings";

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

function companySettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs-1",
    organizationId: "org-1",
    registeredName: null,
    registeredAddress: null,
    companyPhone: null,
    isVatRegistered: false,
    taxId: null,
    receiptFooterMessage: null,
    receiptPaperWidth: "mm58",
    openTime: null,
    closeTime: null,
    timezone: "Asia/Bangkok",
    businessDayStartHour: 5,
    stockDeficitPolicy: "warn_only",
    ...overrides,
  };
}

function taxSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ts-1",
    organizationId: "org-1",
    vatMode: "inclusive",
    vatRate: { toString: () => "7.00" },
    refundApprovalThreshold: { toString: () => "500.00" },
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

describe("updateCompanyInfo", () => {
  it("records an updated entry with the diff", async () => {
    prismaMock.companySettings.findFirst.mockResolvedValue(companySettingsRow() as never);
    prismaMock.companySettings.update.mockResolvedValue({} as never);

    await updateCompanyInfo({
      registeredName: "ร้านชานมไข่มุก",
      registeredAddress: "",
      companyPhone: "",
      isVatRegistered: false,
      taxId: "",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "company_settings",
          changes: expect.arrayContaining([
            { field: "registeredName", oldValue: null, newValue: "ร้านชานมไข่มุก" },
          ]),
        }),
      }),
    );
  });

  it("does not write a log entry when nothing changed", async () => {
    prismaMock.companySettings.findFirst.mockResolvedValue(companySettingsRow() as never);
    prismaMock.companySettings.update.mockResolvedValue({} as never);

    await updateCompanyInfo({
      registeredName: "",
      registeredAddress: "",
      companyPhone: "",
      isVatRegistered: false,
      taxId: "",
    });

    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("updateTaxSettings", () => {
  it("records an updated entry when vatRate changes", async () => {
    prismaMock.taxSettings.findFirst.mockResolvedValue(taxSettingsRow() as never);
    prismaMock.taxSettings.update.mockResolvedValue({} as never);

    await updateTaxSettings({ vatMode: "inclusive", vatRate: 10 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "tax_settings",
          changes: expect.arrayContaining([{ field: "vatRate", oldValue: "7.00", newValue: "10" }]),
        }),
      }),
    );
  });
});

describe("updateReceiptSettings", () => {
  it("records an updated entry", async () => {
    prismaMock.companySettings.findFirst.mockResolvedValue(companySettingsRow() as never);
    prismaMock.companySettings.update.mockResolvedValue({} as never);

    await updateReceiptSettings({ receiptFooterMessage: "ขอบคุณค่ะ", receiptPaperWidth: "mm80" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "updated", entityType: "company_settings" }),
      }),
    );
  });
});

describe("updateBusinessHours", () => {
  it("records an updated entry", async () => {
    prismaMock.companySettings.findFirst.mockResolvedValue(companySettingsRow() as never);
    prismaMock.companySettings.update.mockResolvedValue({} as never);

    await updateBusinessHours({
      openTime: "08:00",
      closeTime: "20:00",
      timezone: "Asia/Bangkok",
      businessDayStartHour: 6,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "updated", entityType: "company_settings" }),
      }),
    );
  });
});

describe("updateStockDeficitPolicy", () => {
  it("records an updated entry", async () => {
    prismaMock.companySettings.findFirst.mockResolvedValue(companySettingsRow() as never);
    prismaMock.companySettings.update.mockResolvedValue({} as never);

    await updateStockDeficitPolicy({ stockDeficitPolicy: "strict_block" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "company_settings",
          changes: [
            { field: "stockDeficitPolicy", oldValue: "warn_only", newValue: "strict_block" },
          ],
        }),
      }),
    );
  });
});

describe("updateIngredientDeficitOverride", () => {
  it("records an updated entry against the ingredient", async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue({
      id: "ing-1",
      branchId: "branch-1",
      name: "ผงชาไทย",
      stockDeficitPolicyOverride: null,
    } as never);
    prismaMock.ingredient.update.mockResolvedValue({} as never);

    await updateIngredientDeficitOverride({ ingredientId: "ing-1", override: "strict_block" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          entityType: "ingredient",
          entityId: "ing-1",
          changes: [
            { field: "stockDeficitPolicyOverride", oldValue: null, newValue: "strict_block" },
          ],
        }),
      }),
    );
  });
});
