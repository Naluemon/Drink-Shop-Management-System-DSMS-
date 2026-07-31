import { prisma } from "@/lib/prisma";
import { PAGE_KEYS, type PageKey, type RolePagePermissionMap } from "@/lib/page-access";
import type { UserRole } from "@/lib/generated/prisma/enums";

// Split out from lib/page-access.ts on purpose, not just for tidiness:
// components/nav-config.ts imports canAccessPage (a pure function) from
// lib/page-access.ts into a "use client" component tree (via
// components/app-shell.tsx -> Sidebar -> getNavItemsWithState). If this
// DB-touching function's top-level `import { prisma }` lived in that same
// module, Next's client bundler would pull the whole `pg` driver (Node
// builtins: dns/net/tls/fs/util) into the browser bundle and crash every
// authenticated page with a Turbopack "Module not found" build error —
// confirmed live via a real browser render, not just inferred from imports.
// Every app/*/page.tsx (all Server Components) imports this file directly;
// nothing client-side should ever import from here.
export async function getRolePagePermissionMap(): Promise<RolePagePermissionMap> {
  const rows = await prisma.rolePagePermission.findMany({ where: { allowed: true } });
  const map = Object.fromEntries(
    PAGE_KEYS.map((key) => [key, new Set<UserRole>()]),
  ) as RolePagePermissionMap;
  for (const row of rows) {
    map[row.pageKey as PageKey]?.add(row.role);
  }
  return map;
}
