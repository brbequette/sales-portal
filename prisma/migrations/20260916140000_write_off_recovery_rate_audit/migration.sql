ALTER TABLE "WriteOffRecoveryCase"
  ADD COLUMN "originalResponsibilityRateBps" INTEGER,
  ADD COLUMN "responsibilityRateOverrideReason" TEXT;

UPDATE "WriteOffRecoveryCase"
SET "originalResponsibilityRateBps" = "responsibilityRateBps"
WHERE "originalResponsibilityRateBps" IS NULL;

ALTER TABLE "WriteOffRecoveryCase"
  ALTER COLUMN "originalResponsibilityRateBps" SET NOT NULL,
  ALTER COLUMN "originalResponsibilityRateBps" SET DEFAULT 5000;

ALTER TABLE "WriteOffRecoveryCase"
  ADD CONSTRAINT "WriteOffRecoveryCase_original_rate_check"
  CHECK ("originalResponsibilityRateBps" BETWEEN 0 AND 10000);

ALTER TABLE "WriteOffRecoveryCase"
  ADD CONSTRAINT "WriteOffRecoveryCase_rate_override_reason_check"
  CHECK (
    "responsibilityRateBps" = "originalResponsibilityRateBps"
    OR length(trim(COALESCE("responsibilityRateOverrideReason", ''))) >= 10
  );
