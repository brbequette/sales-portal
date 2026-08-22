-- Accelerate legacy Zoho document-chain lookups. Newer rows use the
-- denormalized link columns, while imported historical rows may only carry
-- these identifiers inside the cached JSON payload.
CREATE INDEX IF NOT EXISTS "Invoice_salesorderNumber_idx"
  ON "Invoice" ("salesorderNumber");

CREATE INDEX IF NOT EXISTS "Invoice_items_salesorder_id_idx"
  ON "Invoice" ((items->>'salesorder_id'));
CREATE INDEX IF NOT EXISTS "Invoice_items_sales_order_id_idx"
  ON "Invoice" ((items->>'sales_order_id'));
CREATE INDEX IF NOT EXISTS "Invoice_items_salesorder_number_idx"
  ON "Invoice" ((items->>'salesorder_number'));
CREATE INDEX IF NOT EXISTS "Invoice_items_salesOrderNumber_idx"
  ON "Invoice" ((items->>'salesOrderNumber'));
CREATE INDEX IF NOT EXISTS "Invoice_items_estimate_id_idx"
  ON "Invoice" ((items->>'estimate_id'));

CREATE INDEX IF NOT EXISTS "SalesOrder_items_estimate_id_idx"
  ON "SalesOrder" ((items->>'estimate_id'));
CREATE INDEX IF NOT EXISTS "SalesOrder_items_estimate_number_idx"
  ON "SalesOrder" ((items->>'estimate_number'));
CREATE INDEX IF NOT EXISTS "SalesOrder_items_estimateNumber_idx"
  ON "SalesOrder" ((items->>'estimateNumber'));
