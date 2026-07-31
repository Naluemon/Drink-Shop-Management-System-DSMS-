-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Seed exactly one organization for all data that exists before this migration runs.
-- Every environment this migration is ever applied to (local dev, production) has
-- only ever had one shop's worth of data, so a single backfill target is correct.
INSERT INTO "organizations" ("id", "name", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'ร้านของคุณ', now(), now());

-- AlterTable: add nullable FK columns first so the backfill below can run
ALTER TABLE "branches" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "users" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "user_invites" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "tax_settings" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "reason_codes" ADD COLUMN "organization_id" TEXT;

-- Backfill every existing row to the one seeded organization
UPDATE "branches" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "users" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "user_invites" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "company_settings" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "tax_settings" SET "organization_id" = '00000000-0000-0000-0000-000000000001';
UPDATE "reason_codes" SET "organization_id" = '00000000-0000-0000-0000-000000000001';

-- Now safe to enforce NOT NULL
ALTER TABLE "branches" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "user_invites" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "company_settings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tax_settings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "reason_codes" ALTER COLUMN "organization_id" SET NOT NULL;

-- One settings row per organization
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_key" UNIQUE ("organization_id");
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_organization_id_key" UNIQUE ("organization_id");

-- Foreign keys
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reason_codes" ADD CONSTRAINT "reason_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
