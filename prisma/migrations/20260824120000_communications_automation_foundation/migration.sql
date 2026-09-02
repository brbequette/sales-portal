CREATE TABLE "CommunicationEvent" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "contactId" TEXT, "actorId" TEXT,
  "channel" TEXT NOT NULL, "direction" TEXT, "eventType" TEXT NOT NULL, "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "subject" TEXT, "summary" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesCommitment" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "contactId" TEXT, "ownerId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "description" TEXT NOT NULL, "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PROPOSED', "confidence" DOUBLE PRECISION, "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SalesCommitment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AutomationRecommendation" (
  "id" TEXT NOT NULL, "accountId" TEXT, "proposedById" TEXT, "title" TEXT NOT NULL,
  "rationale" TEXT NOT NULL, "triggerType" TEXT NOT NULL, "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL, "evidence" JSONB, "simulation" JSONB, "mode" TEXT NOT NULL DEFAULT 'DRAFT_ONLY',
  "status" TEXT NOT NULL DEFAULT 'PROPOSED', "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AutomationRecommendation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunicationEvent_sourceType_sourceId_eventType_key" ON "CommunicationEvent"("sourceType", "sourceId", "eventType");
CREATE INDEX "CommunicationEvent_accountId_occurredAt_idx" ON "CommunicationEvent"("accountId", "occurredAt");
CREATE INDEX "CommunicationEvent_contactId_occurredAt_idx" ON "CommunicationEvent"("contactId", "occurredAt");
CREATE INDEX "CommunicationEvent_channel_occurredAt_idx" ON "CommunicationEvent"("channel", "occurredAt");
CREATE INDEX "SalesCommitment_ownerId_status_dueAt_idx" ON "SalesCommitment"("ownerId", "status", "dueAt");
CREATE INDEX "SalesCommitment_accountId_createdAt_idx" ON "SalesCommitment"("accountId", "createdAt");
CREATE INDEX "AutomationRecommendation_status_createdAt_idx" ON "AutomationRecommendation"("status", "createdAt");
CREATE INDEX "AutomationRecommendation_accountId_status_idx" ON "AutomationRecommendation"("accountId", "status");
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
