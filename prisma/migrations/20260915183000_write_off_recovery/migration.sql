CREATE TABLE "WriteOffRecoveryCase" (
  "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "responsibleRepId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "responsibilityRateBps" INTEGER NOT NULL DEFAULT 5000,
  "originalCostCents" INTEGER NOT NULL DEFAULT 0, "recoveryCents" INTEGER NOT NULL DEFAULT 0,
  "responsibilityChargeCents" INTEGER NOT NULL DEFAULT 0, "commissionReversalCents" INTEGER NOT NULL DEFAULT 0, "creditCents" INTEGER NOT NULL DEFAULT 0,
  "remainingBalanceCents" INTEGER NOT NULL DEFAULT 0, "dryRunHash" TEXT, "dryRunAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL, "createdById" TEXT NOT NULL, "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3), "approvedById" TEXT, "approvedAt" TIMESTAMP(3),
  "waivedById" TEXT, "waivedAt" TIMESTAMP(3), "waiverReason" TEXT,
  "zohoSyncStatus" TEXT NOT NULL DEFAULT 'DISABLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WriteOffRecoveryCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WriteOffRecoveryCase_invoiceId_key" ON "WriteOffRecoveryCase"("invoiceId");
CREATE INDEX "WriteOffRecoveryCase_responsibleRepId_status_idx" ON "WriteOffRecoveryCase"("responsibleRepId", "status");
CREATE INDEX "WriteOffRecoveryCase_status_createdAt_idx" ON "WriteOffRecoveryCase"("status", "createdAt");

CREATE TABLE "WriteOffRecoveryCostComponent" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "category" TEXT NOT NULL, "direction" TEXT NOT NULL, "amountCents" INTEGER NOT NULL,
  "approved" BOOLEAN NOT NULL DEFAULT false, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
  "idempotencyKey" TEXT NOT NULL, "evidence" JSONB, "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "subjectUserId" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WriteOffRecoveryCostComponent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WriteOffRecoveryCostComponent_idempotencyKey_key" ON "WriteOffRecoveryCostComponent"("idempotencyKey");
CREATE INDEX "WriteOffRecoveryCostComponent_caseId_version_idx" ON "WriteOffRecoveryCostComponent"("caseId", "version");
CREATE INDEX "WriteOffRecoveryCostComponent_category_idx" ON "WriteOffRecoveryCostComponent"("category");

CREATE TABLE "WriteOffReturnInspection" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
  "status" TEXT NOT NULL, "historicalProductCostCents" INTEGER NOT NULL,
  "acceptedProductCostCents" INTEGER NOT NULL DEFAULT 0, "receivedAt" TIMESTAMP(3) NOT NULL,
  "inspectedAt" TIMESTAMP(3), "inspectedById" TEXT, "actorId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WriteOffReturnInspection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WriteOffReturnInspection_idempotencyKey_key" ON "WriteOffReturnInspection"("idempotencyKey");
CREATE INDEX "WriteOffReturnInspection_caseId_version_idx" ON "WriteOffReturnInspection"("caseId", "version");
CREATE INDEX "WriteOffReturnInspection_status_idx" ON "WriteOffReturnInspection"("status");

CREATE TABLE "WriteOffRecoveryLedgerEvent" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "repId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL, "direction" TEXT NOT NULL, "amountCents" INTEGER NOT NULL,
  "balanceBeforeCents" INTEGER NOT NULL, "balanceAfterCents" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
  "actorId" TEXT NOT NULL, "subjectUserId" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "metadata" JSONB, "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WriteOffRecoveryLedgerEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WriteOffRecoveryLedgerEvent_idempotencyKey_key" ON "WriteOffRecoveryLedgerEvent"("idempotencyKey");
CREATE INDEX "WriteOffRecoveryLedgerEvent_caseId_version_idx" ON "WriteOffRecoveryLedgerEvent"("caseId", "version");
CREATE INDEX "WriteOffRecoveryLedgerEvent_repId_postedAt_idx" ON "WriteOffRecoveryLedgerEvent"("repId", "postedAt");

CREATE TABLE "WriteOffRecoveryPolicy" (
  "id" TEXT NOT NULL DEFAULT 'default', "responsibilityRateBps" INTEGER NOT NULL DEFAULT 5000,
  "zohoSyncEnabled" BOOLEAN NOT NULL DEFAULT false, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WriteOffRecoveryPolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WriteOffRecoveryCase" ADD CONSTRAINT "WriteOffRecoveryCase_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WriteOffRecoveryCase" ADD CONSTRAINT "WriteOffRecoveryCase_responsibleRepId_fkey" FOREIGN KEY ("responsibleRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WriteOffRecoveryCostComponent" ADD CONSTRAINT "WriteOffRecoveryCostComponent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "WriteOffRecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WriteOffReturnInspection" ADD CONSTRAINT "WriteOffReturnInspection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "WriteOffRecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WriteOffRecoveryLedgerEvent" ADD CONSTRAINT "WriteOffRecoveryLedgerEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "WriteOffRecoveryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WriteOffRecoveryCase" ADD CONSTRAINT "WriteOffRecoveryCase_rate_check" CHECK ("responsibilityRateBps" BETWEEN 0 AND 10000);
ALTER TABLE "WriteOffRecoveryCase" ADD CONSTRAINT "WriteOffRecoveryCase_status_check" CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','WAIVED','CLOSED'));
ALTER TABLE "WriteOffRecoveryCase" ADD CONSTRAINT "WriteOffRecoveryCase_sync_status_check" CHECK ("zohoSyncStatus" IN ('DISABLED','REVIEW_REQUIRED','APPROVED','SYNCED','ERROR'));
ALTER TABLE "WriteOffRecoveryCostComponent" ADD CONSTRAINT "WriteOffRecoveryCostComponent_amount_check" CHECK ("amountCents" >= 0);
ALTER TABLE "WriteOffRecoveryCostComponent" ADD CONSTRAINT "WriteOffRecoveryCostComponent_direction_check" CHECK ("direction" IN ('COST','RECOVERY'));
ALTER TABLE "WriteOffRecoveryCostComponent" ADD CONSTRAINT "WriteOffRecoveryCostComponent_category_check" CHECK ("category" IN ('HISTORICAL_PRODUCT_COST','GIFT_COST','OUTBOUND_FREIGHT','RETURN_FREIGHT','ACTUAL_CARD_FEE','ACTUAL_TARIFF','COLLECTION_LEGAL_FEE','APPROVED_ADDITIONAL_COST','INSURANCE','VENDOR_REFUND','CARRIER_REFUND','PROCESSOR_REFUND','ACCEPTED_RETURNED_PRODUCT_COST','SALES_TAX','REVENUE','MARKUP','ESTIMATE'));
ALTER TABLE "WriteOffReturnInspection" ADD CONSTRAINT "WriteOffReturnInspection_cost_check" CHECK ("historicalProductCostCents" >= 0 AND "acceptedProductCostCents" >= 0 AND "acceptedProductCostCents" <= "historicalProductCostCents");
ALTER TABLE "WriteOffReturnInspection" ADD CONSTRAINT "WriteOffReturnInspection_status_check" CHECK ("status" IN ('RECEIVED','ACCEPTED_RESELLABLE','DAMAGED','MISSING','UNSELLABLE'));
ALTER TABLE "WriteOffRecoveryLedgerEvent" ADD CONSTRAINT "WriteOffRecoveryLedgerEvent_amount_check" CHECK ("amountCents" >= 0);
ALTER TABLE "WriteOffRecoveryLedgerEvent" ADD CONSTRAINT "WriteOffRecoveryLedgerEvent_direction_check" CHECK ("direction" IN ('DEBIT','CREDIT'));
ALTER TABLE "WriteOffRecoveryLedgerEvent" ADD CONSTRAINT "WriteOffRecoveryLedgerEvent_type_check" CHECK ("eventType" IN ('COMMISSION_REVERSAL','COST_RESPONSIBILITY_DEBIT','RETURN_CREDIT','REFUND_CREDIT','WAIVER_CREDIT','ADJUSTMENT'));
ALTER TABLE "WriteOffRecoveryPolicy" ADD CONSTRAINT "WriteOffRecoveryPolicy_rate_check" CHECK ("responsibilityRateBps" BETWEEN 0 AND 10000);

CREATE FUNCTION prevent_write_off_recovery_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WriteOffRecoveryLedgerEvent is append-only; post a versioned adjustment';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "WriteOffRecoveryLedgerEvent_immutable"
BEFORE UPDATE OR DELETE ON "WriteOffRecoveryLedgerEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_write_off_recovery_ledger_mutation();
