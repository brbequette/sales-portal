-- Queue only. No deal/provider mutation or historical notification is performed by this migration.
CREATE TABLE "DealSyncJob" (
  "invoiceId" TEXT PRIMARY KEY REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "changedAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  "checkedAt" TIMESTAMPTZ,
  "leaseUntil" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX "DealSyncJob_due_idx" ON "DealSyncJob" ("nextAttemptAt", "changedAt");
CREATE FUNCTION titan_enqueue_deal_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rowdata jsonb;
BEGIN
  rowdata := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO "DealSyncJob" ("invoiceId")
  SELECT i.id FROM "Invoice" i WHERE
    (TG_TABLE_NAME = 'Invoice' AND i.id = rowdata->>'id') OR
    (TG_TABLE_NAME = 'Payment' AND (i.id = rowdata->>'invoiceDbId' OR i."zohoId" = rowdata->>'invoiceId')) OR
    (TG_TABLE_NAME IN ('Quote', 'SalesOrder', 'Task') AND i."dealId" = rowdata->>'dealId') OR
    (TG_TABLE_NAME IN ('Package', 'PurchaseOrder') AND (i."salesOrderZohoId" = rowdata->>'salesOrderId' OR i."zohoId" = rowdata->>'invoiceId' OR i.id = rowdata->>'invoiceId')) OR
    (TG_TABLE_NAME = 'SalesClosingChecklist' AND (i.id = rowdata->>'documentId' OR i."zohoId" = rowdata->>'documentId'))
  ON CONFLICT ("invoiceId") DO UPDATE SET "changedAt" = clock_timestamp(), "nextAttemptAt" = clock_timestamp();
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO "DealSyncJob" ("invoiceId") SELECT i.id FROM "Invoice" i
    WHERE (i."dealId" = to_jsonb(OLD)->>'dealId') OR
      (TG_TABLE_NAME = 'Payment' AND (i.id = to_jsonb(OLD)->>'invoiceDbId' OR i."zohoId" = to_jsonb(OLD)->>'invoiceId'))
    ON CONFLICT ("invoiceId") DO UPDATE SET "changedAt" = clock_timestamp(), "nextAttemptAt" = clock_timestamp();
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER invoice_deal_sync AFTER INSERT OR UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER payment_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER quote_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "Quote" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER order_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER task_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "Task" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER package_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "Package" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER purchase_order_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
CREATE TRIGGER closing_checklist_deal_sync AFTER INSERT OR UPDATE OR DELETE ON "SalesClosingChecklist" FOR EACH ROW EXECUTE FUNCTION titan_enqueue_deal_sync();
INSERT INTO "DealSyncJob" ("invoiceId") SELECT id FROM "Invoice";
