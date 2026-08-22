-- Populate the relational invoice number from imported Books snapshots so
-- payment association never needs a repeated JSON scan.
UPDATE "Invoice"
SET "invoiceNumber" = COALESCE(
  "items" ->> 'invoiceNumber',
  "items" ->> 'invoice_number'
)
WHERE "invoiceNumber" IS NULL;

CREATE INDEX IF NOT EXISTS "Invoice_invoiceNumber_idx"
ON "Invoice"("invoiceNumber");
