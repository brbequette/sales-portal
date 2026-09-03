CREATE TABLE "FinancialReview" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT,
  "documentType" TEXT NOT NULL,
  "documentRef" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "sourceType" TEXT,
  "sourceRecord" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolverId" TEXT,
  "resolutionNotes" TEXT,
  CONSTRAINT "FinancialReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialReview_documentType_documentRef_reasonCode_key" ON "FinancialReview"("documentType", "documentRef", "reasonCode");
CREATE INDEX "FinancialReview_status_idx" ON "FinancialReview"("status");
CREATE INDEX "FinancialReview_invoiceId_status_idx" ON "FinancialReview"("invoiceId", "status");
ALTER TABLE "FinancialReview" ADD CONSTRAINT "FinancialReview_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
