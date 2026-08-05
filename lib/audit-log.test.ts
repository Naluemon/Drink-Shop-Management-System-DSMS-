import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog, diffFields, snapshotFields } from "./audit-log";

const prismaMock = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("recordAuditLog", () => {
  it("inserts a row with the given fields", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await recordAuditLog(prismaMock, {
      branchId: "branch-1",
      actorId: "actor-1",
      actorName: "เจ้าของร้าน",
      action: "updated",
      entityType: "ingredient",
      entityId: "ing-1",
      entityName: "ผงชาไทย",
      changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        branchId: "branch-1",
        actorId: "actor-1",
        actorName: "เจ้าของร้าน",
        action: "updated",
        entityType: "ingredient",
        entityId: "ing-1",
        entityName: "ผงชาไทย",
        changes: [{ field: "costPerUnit", oldValue: "20", newValue: "25" }],
      },
    });
  });

  it("stores an explicit SQL NULL (Prisma.DbNull) when no changes are given, for deleted events", async () => {
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await recordAuditLog(prismaMock, {
      branchId: "branch-1",
      actorId: "actor-1",
      actorName: "เจ้าของร้าน",
      action: "deleted",
      entityType: "ingredient",
      entityId: "ing-1",
      entityName: "ผงชาไทย",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changes: Prisma.DbNull }) }),
    );
  });
});

describe("diffFields", () => {
  it("returns only the fields that actually changed", () => {
    const before = { name: "ผงชาไทย", costPerUnit: 20, lowStockThreshold: null };
    const after = { name: "ผงชาไทย", costPerUnit: 25, lowStockThreshold: null };

    const changes = diffFields(before, after, ["name", "costPerUnit", "lowStockThreshold"]);

    expect(changes).toEqual([{ field: "costPerUnit", oldValue: 20, newValue: 25 }]);
  });

  it("stringifies Decimal-like objects (a .toString() method) so they compare and store correctly", () => {
    const decimal = (v: string) => ({ toString: () => v });
    const before = { costPerUnit: decimal("20") };
    const after = { costPerUnit: decimal("20.00") };

    // "20" !== "20.00" as strings — this documents that diffFields does a
    // string comparison, not a numeric one, so callers should pass
    // already-normalized values if trailing zeros shouldn't count as a change.
    const changes = diffFields(before, after, ["costPerUnit"]);

    expect(changes).toEqual([{ field: "costPerUnit", oldValue: "20", newValue: "20.00" }]);
  });

  it("stringifies Date values to ISO strings", () => {
    const before = { openedAt: new Date("2026-08-01T00:00:00.000Z") };
    const after = { openedAt: new Date("2026-08-02T00:00:00.000Z") };

    const changes = diffFields(before, after, ["openedAt"]);

    expect(changes).toEqual([
      {
        field: "openedAt",
        oldValue: "2026-08-01T00:00:00.000Z",
        newValue: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });

  it("treats null and undefined as equal (both become null)", () => {
    const before: { note: string | null | undefined } = { note: null };
    const after: { note: string | null | undefined } = { note: undefined };

    expect(diffFields(before, after, ["note"])).toEqual([]);
  });

  it("allows before/after to be differently-shaped objects, as long as the diffed fields exist in both", () => {
    const before = { name: "ชาไทยเย็น", recipeId: "r1", basePrice: "45", extraField: "x" };
    const after = { name: "ชาไทยเย็น", basePrice: "50" };

    const changes = diffFields(before, after, ["name", "basePrice"]);

    expect(changes).toEqual([{ field: "basePrice", oldValue: "45", newValue: "50" }]);
  });
});

describe("snapshotFields", () => {
  it("returns every field with a null oldValue, for create events", () => {
    const entity = { name: "ผงชาไทย", costPerUnit: 20 };

    expect(snapshotFields(entity, ["name", "costPerUnit"])).toEqual([
      { field: "name", oldValue: null, newValue: "ผงชาไทย" },
      { field: "costPerUnit", oldValue: null, newValue: 20 },
    ]);
  });
});
