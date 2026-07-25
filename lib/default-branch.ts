import { prisma } from "@/lib/prisma";

// DATABASE.md §2: every business table gets branch_id from Phase 3 onward.
// Post-Phase-A-multi-tenant: scoped per organization — each org gets its
// own single default branch, auto-created on first use. Multi-branch-per-
// organization is a future feature, not part of this conversion.
export async function getOrCreateDefaultBranch(organizationId: string) {
  const existing = await prisma.branch.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.branch.create({ data: { name: "สาขาหลัก", organizationId } });
}
