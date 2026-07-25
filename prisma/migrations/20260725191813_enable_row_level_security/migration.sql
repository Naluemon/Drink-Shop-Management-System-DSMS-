-- Tables with a direct organization_id column
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches', 'users', 'user_invites', 'company_settings', 'tax_settings', 'reason_codes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = current_setting(''app.current_org_id'', true))',
      t
    );
  END LOOP;
END $$;

-- Tables with a direct branch_id column: check branch belongs to the current org
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'ingredients', 'recipes', 'menu_categories', 'menus', 'modifier_groups', 'purchase_orders', 'inventory_movements', 'sales_transactions', 'expense_categories', 'expense_entries']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (branch_id IN (SELECT id FROM branches WHERE organization_id = current_setting(''app.current_org_id'', true)))',
      t
    );
  END LOOP;
END $$;

-- Child tables with no branch_id of their own: join to their parent's branch_id
ALTER TABLE "unit_conversions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "unit_conversions" USING (
  ingredient_id IN (SELECT id FROM ingredients WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recipe_ingredients" USING (
  recipe_id IN (SELECT id FROM recipes WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "menu_variants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_variants" USING (
  menu_id IN (SELECT id FROM menus WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "menu_modifier_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_modifier_groups" USING (
  menu_id IN (SELECT id FROM menus WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "modifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "modifiers" USING (
  modifier_group_id IN (SELECT id FROM modifier_groups WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order_items" USING (
  purchase_order_id IN (SELECT id FROM purchase_orders WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "refund_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refund_requests" USING (
  sales_transaction_id IN (SELECT id FROM sales_transactions WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "sales_transaction_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_transaction_items" USING (
  sales_transaction_id IN (SELECT id FROM sales_transactions WHERE branch_id IN (
    SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
  ))
);

ALTER TABLE "sales_transaction_item_modifiers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales_transaction_item_modifiers" USING (
  sales_transaction_item_id IN (SELECT id FROM sales_transaction_items WHERE sales_transaction_id IN (
    SELECT id FROM sales_transactions WHERE branch_id IN (
      SELECT id FROM branches WHERE organization_id = current_setting('app.current_org_id', true)
    )
  ))
);
