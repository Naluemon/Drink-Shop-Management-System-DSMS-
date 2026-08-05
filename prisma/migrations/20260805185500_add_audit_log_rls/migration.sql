-- RLS: same "direct branch_id column" pattern as
-- 20260725191813_enable_row_level_security applied to suppliers/ingredients/etc.
-- Separate migration from 20260805184912_add_audit_log on purpose — editing an
-- already-applied migration file after the fact breaks its recorded checksum.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs" USING (
  branch_id IN (SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true))
);
