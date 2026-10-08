CREATE TABLE "InvoiceReturn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUOTING',
  "snapshot" JSONB NOT NULL,
  "rates" JSONB,
  "quotedAt" TIMESTAMP(3),
  "courierServiceId" TEXT,
  "quotedCostCents" INTEGER,
  "actualCostCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "costResponsibility" TEXT NOT NULL,
  "shipmentId" TEXT,
  "labelUrl" TEXT,
  "trackingNumber" TEXT,
  "trackingUrl" TEXT,
  "labelState" TEXT,
  "purchaseRequestedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "inspection" JSONB,
  "recoveredCostCents" INTEGER,
  "proposedCreditCents" INTEGER,
  "creditNoteId" TEXT,
  "creditedCents" INTEGER,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceReturn_costs_nonnegative" CHECK (
    COALESCE("quotedCostCents",0)>=0 AND COALESCE("actualCostCents",0)>=0 AND
    COALESCE("recoveredCostCents",0)>=0 AND COALESCE("proposedCreditCents",0)>=0 AND COALESCE("creditedCents",0)>=0
  )
);
CREATE UNIQUE INDEX "InvoiceReturn_shipmentId_key" ON "InvoiceReturn"("shipmentId");
CREATE UNIQUE INDEX "InvoiceReturn_creditNoteId_key" ON "InvoiceReturn"("creditNoteId");
CREATE INDEX "InvoiceReturn_invoiceId_createdAt_idx" ON "InvoiceReturn"("invoiceId","createdAt");
CREATE INDEX "InvoiceReturn_status_idx" ON "InvoiceReturn"("status");
