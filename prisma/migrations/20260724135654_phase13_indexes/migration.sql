-- CreateIndex
CREATE INDEX "expense_entries_created_at_idx" ON "expense_entries"("created_at");

-- CreateIndex
CREATE INDEX "expense_entries_category_id_idx" ON "expense_entries"("category_id");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_ingredient_id_idx" ON "inventory_movements"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_ingredient_id_idx" ON "purchase_order_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "refund_requests_sales_transaction_id_idx" ON "refund_requests"("sales_transaction_id");

-- CreateIndex
CREATE INDEX "refund_requests_status_idx" ON "refund_requests"("status");

-- CreateIndex
CREATE INDEX "sales_transaction_items_sales_transaction_id_idx" ON "sales_transaction_items"("sales_transaction_id");

-- CreateIndex
CREATE INDEX "sales_transaction_items_menu_id_idx" ON "sales_transaction_items"("menu_id");

-- CreateIndex
CREATE INDEX "sales_transactions_created_at_idx" ON "sales_transactions"("created_at");

-- CreateIndex
CREATE INDEX "sales_transactions_cashier_id_idx" ON "sales_transactions"("cashier_id");

-- CreateIndex
CREATE INDEX "sales_transactions_reversal_of_id_idx" ON "sales_transactions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "user_invites_email_idx" ON "user_invites"("email");
