import { prisma } from "@/lib/prisma";

// tax_settings / company_settings are singleton tables (docs/DATABASE.md §10)
// — get the one row, creating it with schema defaults on first access. Shared
// across Phase 2 (refund threshold), Phase 8 (POS VAT snapshot + tax invoice
// numbering), and Phase 12 (full Settings UI) so there's exactly one place
// that creates these rows.
export async function getOrCreateTaxSettings() {
  const existing = await prisma.taxSettings.findFirst();
  if (existing) return existing;
  // Phase A (multi-tenant-phase-a-isolation): exactly one Organization exists
  // until Phase B's self-service signup.
  const organization = await prisma.organization.findFirstOrThrow();
  return prisma.taxSettings.create({ data: { organizationId: organization.id } });
}

export async function getOrCreateCompanySettings() {
  const existing = await prisma.companySettings.findFirst();
  if (existing) return existing;
  const organization = await prisma.organization.findFirstOrThrow();
  return prisma.companySettings.create({ data: { organizationId: organization.id } });
}
