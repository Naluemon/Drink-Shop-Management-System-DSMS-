import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { prisma } from "@/lib/prisma";
import { PAGE_KEYS, NON_OWNER_ROLES } from "@/lib/page-access";
import {
  listRolePagePermissions,
  updateRolePagePermissions,
  resetRolePagePermissionsToDefault,
} from "./role-page-permissions";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

function actorRow(role: string) {
  return {
    id: "actor-1",
    email: "a@b.com",
    fullName: "A",
    role,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  mockReset(prismaMock);
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "actor-1" } } });
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
});

describe("listRolePagePermissions", () => {
  it("denies a non-owner role", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await listRolePagePermissions();

    expect("error" in result).toBe(true);
  });

  it("returns one row per (non-owner role, pageKey), defaulting to false with no DB row", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);

    const result = await listRolePagePermissions();

    if ("error" in result) throw new Error("expected rows, got error");
    // One row per (non-owner role, pageKey) — derived from the live tables
    // rather than a hardcoded count, so this doesn't silently drift out of
    // sync whenever a page key is added or removed (see lib/page-access.ts).
    expect(result.rows).toHaveLength(NON_OWNER_ROLES.length * PAGE_KEYS.length);
    expect(result.rows.find((r) => r.role === "cashier" && r.pageKey === "pos")?.allowed).toBe(
      true,
    );
    expect(result.rows.find((r) => r.role === "manager" && r.pageKey === "pos")?.allowed).toBe(
      false,
    );
  });
});

describe("updateRolePagePermissions", () => {
  it("denies a non-owner role and never opens a transaction", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("manager") as never);

    const result = await updateRolePagePermissions({
      changes: [{ role: "cashier", pageKey: "pos", allowed: false }],
    });

    expect("error" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("writes only rows that actually changed, plus one log row per change", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);

    const result = await updateRolePagePermissions({
      changes: [
        { role: "cashier", pageKey: "pos", allowed: true }, // unchanged, must be skipped
        // shift_supervisor IS in the seeded pos defaults, so re-enabling it
        // after a revoke is legal under the revoke-only rule below.
        { role: "shift_supervisor", pageKey: "pos", allowed: true }, // changed false -> true
      ],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "shift_supervisor", pageKey: "pos" } },
      }),
    );
    expect(prismaMock.permissionChangeLog.createMany).toHaveBeenCalledWith({
      data: [{ role: "shift_supervisor", pageKey: "pos", allowed: true, changedBy: "actor-1" }],
    });
  });

  it("writes nothing and opens no transaction when no cell actually changed", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);

    const result = await updateRolePagePermissions({
      changes: [{ role: "cashier", pageKey: "pos", allowed: true }],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// D19 was narrowed at final review: this feature is revoke-only. The seeded
// DEFAULT_ALLOWED_ROLES is the ceiling — an owner may take page access away
// and give it back, but never grant beyond the seed, because the CRUD matrix
// in lib/permissions.ts (untouched by this feature) would still deny the
// page's own data fetch. The client disables those checkboxes, but a Server
// Action is directly callable, so these test it as adversarial input rather
// than as a UI interaction.
describe("updateRolePagePermissions — revoke-only ceiling", () => {
  function ownerActorWithSeededRows() {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
      {
        id: "2",
        role: "accountant",
        pageKey: "reports",
        allowed: true,
        updatedAt: new Date(),
        updatedBy: null,
      },
    ] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);
  }

  it("revokes a page the role has by default", async () => {
    ownerActorWithSeededRows();

    const result = await updateRolePagePermissions({
      changes: [{ role: "accountant", pageKey: "reports", allowed: false }],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "accountant", pageKey: "reports" } },
        update: expect.objectContaining({ allowed: false }),
      }),
    );
  });

  it("rejects a direct call granting a page beyond the seeded default, writing nothing", async () => {
    ownerActorWithSeededRows();

    // accountant has no POS access in DEFAULT_ALLOWED_ROLES, and no "create
    // pos_sale" in the CRUD matrix either — SECURITY.md §1's "Accountant
    // ไม่มีสิทธิ์เข้า POS เด็ดขาด" must stay true regardless of this table.
    const result = await updateRolePagePermissions({
      changes: [{ role: "accountant", pageKey: "pos", allowed: true }],
    });

    expect("error" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.rolePagePermission.upsert).not.toHaveBeenCalled();
    expect(prismaMock.permissionChangeLog.createMany).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when one cell exceeds defaults, even alongside legal revokes", async () => {
    ownerActorWithSeededRows();

    const result = await updateRolePagePermissions({
      changes: [
        { role: "cashier", pageKey: "pos", allowed: false }, // legal revoke
        { role: "employee", pageKey: "settings", allowed: true }, // illegal grant
      ],
    });

    expect("error" in result).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.rolePagePermission.upsert).not.toHaveBeenCalled();
  });

  it("allows re-enabling a page that was revoked but IS in the seeded defaults", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    // cashier/pos previously revoked by the owner
    prismaMock.rolePagePermission.findMany.mockResolvedValue([
      {
        id: "1",
        role: "cashier",
        pageKey: "pos",
        allowed: false,
        updatedAt: new Date(),
        updatedBy: "actor-1",
      },
    ] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);

    const result = await updateRolePagePermissions({
      changes: [{ role: "cashier", pageKey: "pos", allowed: true }],
    });

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "cashier", pageKey: "pos" } },
        update: expect.objectContaining({ allowed: true }),
      }),
    );
  });
});

describe("resetRolePagePermissionsToDefault", () => {
  it("submits the full default matrix, upserting every allowed pair to true", async () => {
    prismaMock.user.findUnique.mockResolvedValue(actorRow("owner") as never);
    prismaMock.rolePagePermission.findMany.mockResolvedValue([] as never);
    prismaMock.rolePagePermission.upsert.mockResolvedValue({} as never);
    prismaMock.permissionChangeLog.createMany.mockResolvedValue({ count: 1 } as never);

    const result = await resetRolePagePermissionsToDefault();

    expect("success" in result).toBe(true);
    expect(prismaMock.rolePagePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role_pageKey: { role: "shift_supervisor", pageKey: "pos" } },
        create: expect.objectContaining({ allowed: true }),
      }),
    );
  });
});
