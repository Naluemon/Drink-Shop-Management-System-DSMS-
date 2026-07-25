import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("./prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "./prisma";
import {
  AUTH_CONFIG,
  isAccountLocked,
  incrementFailedLogin,
  isSessionExpired,
  isUserActive,
} from "./auth-utils";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

// DECISIONS.md D13: session timeout 8 ชั่วโมง
describe("isSessionExpired", () => {
  it("treats a null last sign-in as expired", () => {
    expect(isSessionExpired(null)).toBe(true);
  });

  it("is not expired just under the 8 hour boundary", () => {
    const almost8h = new Date(Date.now() - (8 * 60 * 60 * 1000 - 1000));
    expect(isSessionExpired(almost8h)).toBe(false);
  });

  it("is expired just over the 8 hour boundary", () => {
    const over8h = new Date(Date.now() - (8 * 60 * 60 * 1000 + 1000));
    expect(isSessionExpired(over8h)).toBe(true);
  });
});

// DECISIONS.md D13 / FR-AUTH-06: ล็อกบัญชี 15 นาทีหลัง login ผิด 5 ครั้งติดต่อกัน
describe("account lockout (D13, FR-AUTH-06)", () => {
  it("is not locked when lockedUntil is null", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      lockedUntil: null,
      failedLoginCount: 2,
    } as never);

    expect(await isAccountLocked("user-1")).toBe(false);
  });

  it("is locked while lockedUntil is in the future", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
      failedLoginCount: 5,
    } as never);

    expect(await isAccountLocked("user-1")).toBe(true);
  });

  it("auto-unlocks and resets the counter once lockedUntil has passed", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      lockedUntil: new Date(Date.now() - 1000),
      failedLoginCount: 5,
    } as never);

    const locked = await isAccountLocked("user-1");

    expect(locked).toBe(false);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lockedUntil: null, failedLoginCount: 0 },
    });
  });

  it("locks the account once failed attempts reach MAX_FAILED_ATTEMPTS (5)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      failedLoginCount: AUTH_CONFIG.MAX_FAILED_ATTEMPTS - 1,
    } as never);

    await incrementFailedLogin("user-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        failedLoginCount: AUTH_CONFIG.MAX_FAILED_ATTEMPTS,
        lockedUntil: expect.any(Date),
      },
    });
  });

  it("does not lock the account below MAX_FAILED_ATTEMPTS", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ failedLoginCount: 1 } as never);

    await incrementFailedLogin("user-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { failedLoginCount: 2 },
    });
  });
});

// FR-USR-03 / D15: ผู้ใช้ที่ถูกปิดการใช้งานต้อง login ไม่ได้ทันที
describe("isUserActive", () => {
  it("returns false when the user record is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await isUserActive("missing")).toBe(false);
  });

  it("reflects the isActive column", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isActive: false } as never);
    expect(await isUserActive("user-1")).toBe(false);
  });
});
