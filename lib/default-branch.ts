import { prisma } from "@/lib/prisma";

// DATABASE.md §2: every business table gets branch_id from Phase 3 onward,
// even though MVP only ever has one branch — "ใส่ default เดียว". This is the
// single place that resolves/creates that one branch, reused by every
// feature module from here on (Ingredient, Recipe, Menu, Inventory, ...).
export async function getOrCreateDefaultBranch() {
  const existing = await prisma.branch.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  // Phase A (multi-tenant-phase-a-isolation): exactly one Organization exists
  // until Phase B's self-service signup — resolve it here rather than
  // threading an organizationId through every caller of this function.
  const organization = await prisma.organization.findFirstOrThrow();
  return prisma.branch.create({ data: { name: "สาขาหลัก", organizationId: organization.id } });
}
