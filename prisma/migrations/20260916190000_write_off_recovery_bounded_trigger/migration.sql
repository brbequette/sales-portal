ALTER TABLE "WriteOffRecoveryCase"
  ALTER COLUMN "responsibleRepId" DROP NOT NULL,
  ADD COLUMN "triggerSourceField" TEXT NOT NULL DEFAULT 'MANUAL_LEGACY',
  ADD COLUMN "triggerZohoInvoiceId" TEXT,
  ADD COLUMN "evidenceStatus" TEXT NOT NULL DEFAULT 'PENDING_EVIDENCE',
  ADD COLUMN "missingRequirements" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "salespersonSnapshot" TEXT,
  ADD COLUMN "triggerDetectedAt" TIMESTAMP(3);

UPDATE "WriteOffRecoveryCase" c
SET "triggerZohoInvoiceId" = i."zohoId",
    "triggerDetectedAt" = c."createdAt"
FROM "Invoice" i
WHERE i.id = c."invoiceId";

CREATE UNIQUE INDEX "WriteOffRecoveryCase_triggerSourceField_triggerZohoInvoiceId_key"
  ON "WriteOffRecoveryCase"("triggerSourceField", "triggerZohoInvoiceId");

ALTER TABLE "WriteOffRecoveryCase"
  ADD CONSTRAINT "WriteOffRecoveryCase_evidence_status_check"
  CHECK ("evidenceStatus" IN ('PENDING_EVIDENCE','READY_FOR_DRY_RUN','REVIEW_REQUIRED'));

CREATE TABLE "WriteOffRecoveryTriggerRecord" (
  "id" TEXT NOT NULL,
    "caseId" TEXT,
  "localInvoiceId" TEXT NOT NULL,
  "zohoInvoiceId" TEXT NOT NULL,
  "sourceField" TEXT NOT NULL,
  "previousValue" BOOLEAN,
    "newValue" BOOLEAN,
    "observationKind" TEXT NOT NULL DEFAULT 'BOOLEAN',
    "anomalyCode" TEXT,
  "sourceTimestamp" TIMESTAMP(3),
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "missingRequirements" JSONB NOT NULL,
    CONSTRAINT "WriteOffRecoveryTriggerRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WriteOffRecoveryTriggerRecord"
ADD CONSTRAINT "WriteOffRecoveryTriggerRecord_observation_shape_check"
CHECK (("observationKind" = 'BOOLEAN' AND "newValue" IS NOT NULL AND "anomalyCode" IS NULL)
    OR ("observationKind" = 'PARSE_ANOMALY' AND "newValue" IS NULL AND "anomalyCode" IS NOT NULL));

CREATE UNIQUE INDEX "WriteOffRecoveryTriggerRecord_idempotencyKey_key"
  ON "WriteOffRecoveryTriggerRecord"("idempotencyKey");
CREATE INDEX "WriteOffRecoveryTriggerRecord_caseId_ingestedAt_idx"
  ON "WriteOffRecoveryTriggerRecord"("caseId", "ingestedAt");
CREATE INDEX "WriteOffRecoveryTriggerRecord_zohoInvoiceId_sourceField_idx"
  ON "WriteOffRecoveryTriggerRecord"("zohoInvoiceId", "sourceField");

ALTER TABLE "WriteOffRecoveryTriggerRecord"
  ADD CONSTRAINT "WriteOffRecoveryTriggerRecord_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "WriteOffRecoveryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_write_off_recovery_trigger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WriteOffRecoveryTriggerRecord is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WriteOffRecoveryTriggerRecord_immutable"
BEFORE UPDATE OR DELETE ON "WriteOffRecoveryTriggerRecord"
FOR EACH ROW EXECUTE FUNCTION prevent_write_off_recovery_trigger_mutation();
