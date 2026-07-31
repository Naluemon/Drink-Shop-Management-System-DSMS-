-- CreateTable
CREATE TABLE "role_page_permissions" (
    "id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "page_key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "role_page_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_change_logs" (
    "id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "page_key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_page_permissions_role_page_key_key" ON "role_page_permissions"("role", "page_key");

-- Seed: reproduce today's exact default page access (see
-- docs/superpowers/specs/2026-07-30-role-page-permissions-design.md §7).
-- Only ALLOWED pairs get a row — an absent (role, page_key) pair means
-- denied (fail-safe-closed). updated_at has no real prior edit, so it's
-- just set to the seed time; updated_by stays NULL ("untouched since seed").
INSERT INTO "role_page_permissions" ("id", "role", "page_key", "allowed", "updated_at") VALUES
  ('seed-role-page-perm-01', 'shift_supervisor', 'pos', true, now()),
  ('seed-role-page-perm-02', 'cashier', 'pos', true, now()),
  ('seed-role-page-perm-03', 'manager', 'refunds', true, now()),
  ('seed-role-page-perm-04', 'shift_supervisor', 'refunds', true, now()),
  ('seed-role-page-perm-05', 'manager', 'ingredients', true, now()),
  ('seed-role-page-perm-06', 'shift_supervisor', 'ingredients', true, now()),
  ('seed-role-page-perm-07', 'cashier', 'ingredients', true, now()),
  ('seed-role-page-perm-08', 'employee', 'ingredients', true, now()),
  ('seed-role-page-perm-09', 'manager', 'recipes', true, now()),
  ('seed-role-page-perm-10', 'shift_supervisor', 'recipes', true, now()),
  ('seed-role-page-perm-11', 'cashier', 'recipes', true, now()),
  ('seed-role-page-perm-12', 'manager', 'menus', true, now()),
  ('seed-role-page-perm-13', 'shift_supervisor', 'menus', true, now()),
  ('seed-role-page-perm-14', 'cashier', 'menus', true, now()),
  ('seed-role-page-perm-15', 'manager', 'modifier-groups', true, now()),
  ('seed-role-page-perm-16', 'shift_supervisor', 'modifier-groups', true, now()),
  ('seed-role-page-perm-17', 'cashier', 'modifier-groups', true, now()),
  ('seed-role-page-perm-18', 'manager', 'inventory', true, now()),
  ('seed-role-page-perm-19', 'shift_supervisor', 'inventory', true, now()),
  ('seed-role-page-perm-20', 'employee', 'inventory', true, now()),
  ('seed-role-page-perm-21', 'manager', 'suppliers', true, now()),
  ('seed-role-page-perm-22', 'shift_supervisor', 'suppliers', true, now()),
  ('seed-role-page-perm-23', 'manager', 'purchases', true, now()),
  ('seed-role-page-perm-24', 'shift_supervisor', 'purchases', true, now()),
  ('seed-role-page-perm-25', 'manager', 'expenses', true, now()),
  ('seed-role-page-perm-26', 'accountant', 'expenses', true, now()),
  ('seed-role-page-perm-27', 'manager', 'reports', true, now()),
  ('seed-role-page-perm-28', 'shift_supervisor', 'reports', true, now()),
  ('seed-role-page-perm-29', 'accountant', 'reports', true, now()),
  ('seed-role-page-perm-30', 'manager', 'users', true, now());
