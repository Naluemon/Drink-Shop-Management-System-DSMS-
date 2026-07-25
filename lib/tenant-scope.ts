import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/generated/prisma/client";

export interface ActorWithOrg {
  actor: User;
  organizationId: string;
  branchId: string;
}

// Resolves the logged-in Supabase user to their Prisma User row plus their
// organization and (single, for now — multi-branch-per-org is a future
// feature, not part of this conversion) branch. Replaces every action
// file's duplicated getActor(). Returns null if not logged in, the user
// row doesn't exist yet, or their organization somehow has no branch.
//
// The two lookups below (user by auth id, branch by the resolved
// organizationId) are intentionally NOT wrapped in withOrgScope(): each is
// keyed by a value that already narrows to at most one tenant (the
// caller's own Supabase auth id; then that same user's own
// organizationId), so there's no cross-tenant read to guard against here.
// Every OTHER query in the app, once this actor is resolved, must go
// through withOrgScope() below.
export async function getActorWithOrg(): Promise<ActorWithOrg | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const actor = await prisma.user.findUnique({ where: { id: user.id } });
  if (!actor) return null;

  const branch = await prisma.branch.findFirst({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) return null;

  return { actor, organizationId: actor.organizationId, branchId: branch.id };
}

// Wraps `callback` in a transaction that sets the Postgres session variable
// the RLS policies check (prisma/migrations/<ts>_enable_row_level_security),
// scoped to just that transaction via set_config(..., true) — the third
// argument makes it equivalent to SET LOCAL, so it can never leak onto a
// later request that reuses the same pooled connection. `callback` receives
// the transaction client, not the top-level `prisma` singleton — every
// query made through it is protected by RLS even if its own `where` clause
// forgets to filter by branch/org.
// Grabs the type of the transaction client Prisma's own $transaction()
// callback receives, instead of naming a generated type that may not exist
// under the same name across Prisma versions/generators.
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function withOrgScope<T>(
  organizationId: string,
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return callback(tx);
  });
}
