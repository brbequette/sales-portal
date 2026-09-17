-- Nullable columns deliberately leave existing immutable anomaly rows untouched.
-- Readers label NULL schema versions LEGACY_UNKNOWN without fabricating evidence.
ALTER TABLE "WriteOffRecoveryTriggerRecord"
  ADD COLUMN "observedFieldPath" TEXT,
  ADD COLUMN "observedJsonType" TEXT,
  ADD COLUMN "sanitizedStructuralShape" TEXT,
  ADD COLUMN "checkboxTokenClass" TEXT,
  ADD COLUMN "sourceInvoiceFingerprint" TEXT,
  ADD COLUMN "sourceModificationTimestamp" TIMESTAMP(3),
  ADD COLUMN "anomalySchemaVersion" TEXT;

CREATE INDEX "WriteOffRecoveryTriggerRecord_observationKind_anomalySchemaVersion_idx"
  ON "WriteOffRecoveryTriggerRecord"("observationKind", "anomalySchemaVersion");

CREATE INDEX "WriteOffRecoveryTriggerRecord_sourceInvoiceFingerprint_idx"
  ON "WriteOffRecoveryTriggerRecord"("sourceInvoiceFingerprint");

ALTER TABLE "WriteOffRecoveryTriggerRecord"
  ADD CONSTRAINT "WriteOffRecoveryTriggerRecord_anomaly_observability_check"
  CHECK (
    "anomalySchemaVersion" IS NULL
    OR (
      "observationKind" = 'PARSE_ANOMALY'
      AND "anomalySchemaVersion" = 'SANITIZED_V1'
      AND "observedFieldPath" IN ('TOP_LEVEL', 'CUSTOM_FIELD_HASH', 'CUSTOM_FIELDS_ARRAY')
      AND "observedJsonType" IN ('NULL', 'STRING', 'NUMBER', 'OBJECT', 'ARRAY', 'UNKNOWN')
      AND "checkboxTokenClass" IN ('STRING_TRUE', 'STRING_FALSE', 'STRING_YES_NO', 'STRING_ONE_ZERO', 'NULL', 'OBJECT', 'ARRAY', 'NUMBER', 'OTHER_STRING', 'UNKNOWN')
      AND "sourceInvoiceFingerprint" IS NOT NULL
    )
  );
