-- Generated from read-only Prisma schema diff; destructive operations intentionally excluded.
-- AlterTable
ALTER TABLE "CallScript" ADD COLUMN IF NOT EXISTS "closingPrompt" TEXT,
ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT 'SALES',
ADD COLUMN IF NOT EXISTS "discoveryPrompts" JSONB,
ADD COLUMN IF NOT EXISTS "objectionResponses" JSONB,
ADD COLUMN IF NOT EXISTS "objective" TEXT,
ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "scenario" TEXT NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "conversationId" TEXT,
ADD COLUMN IF NOT EXISTS "emailMailboxId" TEXT,
ADD COLUMN IF NOT EXISTS "preview" TEXT,
ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "processingError" TEXT,
ADD COLUMN IF NOT EXISTS "rawMetadata" JSONB;

-- AlterTable
ALTER TABLE "SalesClosingChecklist" ADD COLUMN IF NOT EXISTS "evidence" JSONB;


-- CreateTable
CREATE TABLE IF NOT EXISTS "CommunicationEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "actorId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "subject" TEXT,
    "summary" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesCommitment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationRecommendation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "proposedById" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "evidence" JSONB,
    "simulation" JSONB,
    "mode" TEXT NOT NULL DEFAULT 'DRAFT_ONLY',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailMailbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'MICROSOFT_365',
    "mailboxType" TEXT NOT NULL DEFAULT 'USER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "includeInbox" BOOLEAN NOT NULL DEFAULT true,
    "includeSent" BOOLEAN NOT NULL DEFAULT true,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "lookbackDays" INTEGER NOT NULL DEFAULT 90,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailAttachment" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "providerAttachmentId" TEXT,
    "name" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "sha256" TEXT,
    "storagePath" TEXT,
    "classification" TEXT,
    "extractionStatus" TEXT NOT NULL DEFAULT 'METADATA_ONLY',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailOperationalEvent" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "accountId" TEXT,
    "invoiceId" TEXT,
    "salesOrderId" TEXT,
    "purchaseOrderId" TEXT,
    "packageId" TEXT,
    "matchMethod" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "conflictReason" TEXT,
    "proposedChanges" JSONB,
    "appliedChanges" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OperationalEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityNumber" TEXT,
    "accountId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "status" TEXT NOT NULL DEFAULT 'INFO',
    "metadata" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkAssignment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityNumber" TEXT,
    "accountId" TEXT,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "escalationId" TEXT,
    "nextAction" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationSyncState" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "lastPullAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastWriteAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cursor" TEXT,
    "oldestQueuedAt" TIMESTAMP(3),
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "deadLetterCount" INTEGER NOT NULL DEFAULT 0,
    "lastDurationMs" INTEGER,
    "lastProcessedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationException" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalNumber" TEXT,
    "exceptionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "proposedMatches" JSONB,
    "confidence" DOUBLE PRECISION,
    "resolvedEntityId" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskOutcome" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "outcomeType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextAction" TEXT,
    "followUpAt" TIMESTAMP(3),
    "accountId" TEXT,
    "documentType" TEXT,
    "documentId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunicationEvent_accountId_occurredAt_idx" ON "CommunicationEvent"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunicationEvent_contactId_occurredAt_idx" ON "CommunicationEvent"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunicationEvent_channel_occurredAt_idx" ON "CommunicationEvent"("channel", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationEvent_sourceType_sourceId_eventType_key" ON "CommunicationEvent"("sourceType", "sourceId", "eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesCommitment_ownerId_status_dueAt_idx" ON "SalesCommitment"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesCommitment_accountId_createdAt_idx" ON "SalesCommitment"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRecommendation_status_createdAt_idx" ON "AutomationRecommendation"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutomationRecommendation_accountId_status_idx" ON "AutomationRecommendation"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailMailbox_address_key" ON "EmailMailbox"("address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailMailbox_userId_idx" ON "EmailMailbox"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailMailbox_enabled_autoSync_idx" ON "EmailMailbox"("enabled", "autoSync");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAttachment_emailId_idx" ON "EmailAttachment"("emailId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAttachment_classification_idx" ON "EmailAttachment"("classification");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAttachment_emailId_providerAttachmentId_key" ON "EmailAttachment"("emailId", "providerAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailOperationalEvent_sourceFingerprint_key" ON "EmailOperationalEvent"("sourceFingerprint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_status_createdAt_idx" ON "EmailOperationalEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_eventType_status_idx" ON "EmailOperationalEvent"("eventType", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_invoiceId_idx" ON "EmailOperationalEvent"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_salesOrderId_idx" ON "EmailOperationalEvent"("salesOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_purchaseOrderId_idx" ON "EmailOperationalEvent"("purchaseOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_packageId_idx" ON "EmailOperationalEvent"("packageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOperationalEvent_accountId_idx" ON "EmailOperationalEvent"("accountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalEvent_entityType_entityId_occurredAt_idx" ON "OperationalEvent"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalEvent_accountId_occurredAt_idx" ON "OperationalEvent"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalEvent_eventType_occurredAt_idx" ON "OperationalEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkAssignment_status_priority_dueAt_idx" ON "WorkAssignment"("status", "priority", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkAssignment_ownerId_status_idx" ON "WorkAssignment"("ownerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkAssignment_stage_status_idx" ON "WorkAssignment"("stage", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkAssignment_entityType_entityId_key" ON "WorkAssignment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationSyncState_integration_lastSuccessAt_idx" ON "IntegrationSyncState"("integration", "lastSuccessAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSyncState_integration_entityType_key" ON "IntegrationSyncState"("integration", "entityType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationException_status_createdAt_idx" ON "IntegrationException"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationException_entityType_status_idx" ON "IntegrationException"("entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationException_integration_entityType_externalId_exce_key" ON "IntegrationException"("integration", "entityType", "externalId", "exceptionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskOutcome_taskId_createdAt_idx" ON "TaskOutcome"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskOutcome_accountId_createdAt_idx" ON "TaskOutcome"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskOutcome_outcomeType_createdAt_idx" ON "TaskOutcome"("outcomeType", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CallScript_department_scenario_isActive_idx" ON "CallScript"("department", "scenario", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Email_emailMailboxId_receivedAt_idx" ON "Email"("emailMailboxId", "receivedAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationEvent" ADD CONSTRAINT "CommunicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommitment" ADD CONSTRAINT "SalesCommitment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRecommendation" ADD CONSTRAINT "AutomationRecommendation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_emailMailboxId_fkey" FOREIGN KEY ("emailMailboxId") REFERENCES "EmailMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOperationalEvent" ADD CONSTRAINT "EmailOperationalEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
