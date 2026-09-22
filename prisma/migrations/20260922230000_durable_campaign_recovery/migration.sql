CREATE TYPE "CampaignJobState" AS ENUM ('QUEUED','RUNNING','RECOVERING','PAUSED','COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED','LEGACY_QUARANTINED');
CREATE TYPE "CampaignReviewState" AS ENUM ('SUBMITTING','AWAITING_DELIVERY_RECEIPTS','RECONCILING','REVIEW_READY','REVIEWED_CLOSED');
CREATE TYPE "CampaignRecipientState" AS ENUM ('PENDING','LEASED','SENDING','ACCEPTED','FAILED','AMBIGUOUS','SKIPPED');
CREATE TYPE "CampaignAttemptState" AS ENUM ('CLAIMED','SENDING','SUBMITTED','ACCEPTED','FAILED','AMBIGUOUS');
CREATE TYPE "PhoneDeliverabilityStatus" AS ENUM ('UNKNOWN','SMS_CAPABLE','DELIVERED','INVALID','LANDLINE_NON_MOBILE','CARRIER_BLOCKED','UNSUPPORTED_COUNTRY','OPTED_OUT','TEMPORARILY_UNAVAILABLE','MANUAL_REVIEW');
CREATE TYPE "PhoneSuppressionStatus" AS ENUM ('ELIGIBLE','TECHNICAL_SUPPRESSED','OPT_OUT_SUPPRESSED','LEGAL_SUPPRESSED','MANUAL_SUPPRESSED');
ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE "CampaignJob" ADD COLUMN "reviewState" "CampaignReviewState" NOT NULL DEFAULT 'SUBMITTING', ADD COLUMN "workerHeartbeatAt" TIMESTAMP(3), ADD COLUMN "submissionCompletedAt" TIMESTAMP(3), ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "legacyRecordedAccepted" INTEGER, ADD COLUMN "legacyRecordedFailed" INTEGER, ADD COLUMN "legacyRawMissingCount" INTEGER, ADD COLUMN "quarantineReason" TEXT;
ALTER TABLE "CampaignJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CampaignJob" ALTER COLUMN "status" TYPE "CampaignJobState" USING (
  CASE
    WHEN "id" = 'cmud3ggj9000311xvyygo6aje' THEN 'LEGACY_QUARANTINED'
    WHEN "status" = 'CANCELLED' THEN 'CANCELLED'
    WHEN "status" = 'DONE' THEN 'COMPLETED'
    ELSE 'LEGACY_QUARANTINED'
  END::"CampaignJobState"
);
ALTER TABLE "CampaignJob" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

UPDATE "CampaignJob" j SET
  "legacyRecordedAccepted" = x.accepted,
  "legacyRecordedFailed" = x.failed,
  "legacyRawMissingCount" = GREATEST(j."total" - x.outcomes, 0),
  "quarantineReason" = CASE WHEN j."id" = 'cmud3ggj9000311xvyygo6aje' THEN 'Legacy index/result mismatch: 201 index, 212 outcomes; missing results are not safe to resend.' ELSE 'Legacy job cannot be resumed without recipient-level attempt evidence.' END
FROM (SELECT j2."id", COUNT(l.*) FILTER (WHERE l."status"='SUCCESS')::int accepted, COUNT(l.*) FILTER (WHERE l."status"='FAILED')::int failed, COUNT(l.*)::int outcomes FROM "CampaignJob" j2 LEFT JOIN "CampaignLog" l ON l."campaignBlastId"=j2."blastId" GROUP BY j2."id") x
WHERE j."id"=x."id" AND j."status"='LEGACY_QUARANTINED';

CREATE TABLE "CampaignRecipient" ("id" TEXT PRIMARY KEY, "campaignJobId" TEXT NOT NULL, "originalIndex" INTEGER NOT NULL, "accountId" TEXT, "contactId" TEXT, "originalPhone" TEXT, "normalizedPhone" TEXT, "state" "CampaignRecipientState" NOT NULL DEFAULT 'PENDING', "deliveryStatus" TEXT NOT NULL DEFAULT 'unknown', "leaseOwner" TEXT, "leaseExpiresAt" TIMESTAMP(3), "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastAttemptId" TEXT, "acceptedAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "ambiguousAt" TIMESTAMP(3), "skippedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "lastProviderHttpStatus" INTEGER, "lastProviderCode" TEXT, "lastProviderStatus" TEXT, "lastProviderMessage" TEXT, "lastProviderLogId" TEXT, "lastProviderMmsId" TEXT, "dispositionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CampaignRecipient_campaignJobId_fkey" FOREIGN KEY ("campaignJobId") REFERENCES "CampaignJob"("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX "CampaignRecipient_campaignJobId_originalIndex_key" ON "CampaignRecipient"("campaignJobId","originalIndex"); CREATE INDEX "CampaignRecipient_campaignJobId_state_idx" ON "CampaignRecipient"("campaignJobId","state"); CREATE INDEX "CampaignRecipient_state_leaseExpiresAt_idx" ON "CampaignRecipient"("state","leaseExpiresAt"); CREATE INDEX "CampaignRecipient_normalizedPhone_idx" ON "CampaignRecipient"("normalizedPhone");
CREATE TABLE "CampaignAttempt" ("id" TEXT PRIMARY KEY, "campaignRecipientId" TEXT NOT NULL, "workerId" TEXT NOT NULL, "state" "CampaignAttemptState" NOT NULL, "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sendingAt" TIMESTAMP(3), "providerResponseAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "normalizedRecipient" TEXT NOT NULL, "sender" TEXT NOT NULL, "providerHttpStatus" INTEGER, "zohoCode" TEXT, "zohoStatus" TEXT, "zohoMessage" TEXT, "zohoLogId" TEXT, "zohoMmsId" TEXT, "deploymentId" TEXT, "interruptionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CampaignAttempt_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE);
CREATE INDEX "CampaignAttempt_campaignRecipientId_createdAt_idx" ON "CampaignAttempt"("campaignRecipientId","createdAt"); CREATE INDEX "CampaignAttempt_state_createdAt_idx" ON "CampaignAttempt"("state","createdAt");
CREATE TABLE "PhoneDeliverability" ("id" TEXT PRIMARY KEY, "normalizedPhone" TEXT NOT NULL, "channel" TEXT NOT NULL, "deliverabilityStatus" "PhoneDeliverabilityStatus" NOT NULL DEFAULT 'UNKNOWN', "suppressionStatus" "PhoneSuppressionStatus" NOT NULL DEFAULT 'ELIGIBLE', "suppressionReason" TEXT, "providerCode" TEXT, "providerMessage" TEXT, "sourceCampaignJobId" TEXT, "sourceRecipientId" TEXT, "sourceAttemptId" TEXT, "firstFailureAt" TIMESTAMP(3), "mostRecentFailureAt" TIMESTAMP(3), "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0, "lastSuccessfulDeliveryAt" TIMESTAMP(3), "lastCheckedAt" TIMESTAMP(3), "automaticDecision" BOOLEAN NOT NULL DEFAULT true, "overrideAdministratorId" TEXT, "overrideReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "PhoneDeliverability_normalizedPhone_channel_key" ON "PhoneDeliverability"("normalizedPhone","channel"); CREATE INDEX "PhoneDeliverability_suppressionStatus_idx" ON "PhoneDeliverability"("suppressionStatus");
CREATE TABLE "PhoneDeliverabilityReview" ("id" TEXT PRIMARY KEY, "phoneDeliverabilityId" TEXT NOT NULL, "administratorId" TEXT NOT NULL, "previousDeliverabilityStatus" "PhoneDeliverabilityStatus" NOT NULL, "nextDeliverabilityStatus" "PhoneDeliverabilityStatus" NOT NULL, "previousSuppressionStatus" "PhoneSuppressionStatus" NOT NULL, "nextSuppressionStatus" "PhoneSuppressionStatus" NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PhoneDeliverabilityReview_phoneDeliverabilityId_fkey" FOREIGN KEY ("phoneDeliverabilityId") REFERENCES "PhoneDeliverability"("id") ON DELETE CASCADE);
CREATE INDEX "PhoneDeliverabilityReview_phoneDeliverabilityId_createdAt_idx" ON "PhoneDeliverabilityReview"("phoneDeliverabilityId","createdAt");
