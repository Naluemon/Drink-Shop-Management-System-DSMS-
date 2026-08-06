-- RLS: organizations is the tenant root — every child table already has a
-- tenant_isolation policy (20260725191813_enable_row_level_security,
-- 20260805185500_add_audit_log_rls) but this table itself was missed.
-- Compares against id directly (not organization_id, since this row IS the
-- organization) — same session variable every other policy reads.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations" USING (
  id = current_setting('app.current_org_id', true)
);
