ALTER TABLE "SalesClosingChecklist" ADD COLUMN "evidence" JSONB;

CREATE TABLE "OperationalAction" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "actionType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "entityNumber" TEXT,
  "accountId" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "payload" JSONB,
  "result" JSONB, "errorCode" TEXT, "errorMessage" TEXT, "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5, "nextAttemptAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "actorId" TEXT, "actorName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperationalAction_idempotencyKey_key" ON "OperationalAction"("idempotencyKey");
CREATE INDEX "OperationalAction_status_nextAttemptAt_idx" ON "OperationalAction"("status", "nextAttemptAt");
CREATE INDEX "OperationalAction_entityType_entityId_createdAt_idx" ON "OperationalAction"("entityType", "entityId", "createdAt");
CREATE INDEX "OperationalAction_accountId_createdAt_idx" ON "OperationalAction"("accountId", "createdAt");

CREATE TABLE "OperationalEvent" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "entityNumber" TEXT,
  "accountId" TEXT, "eventType" TEXT NOT NULL, "title" TEXT NOT NULL, "detail" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PORTAL', "status" TEXT NOT NULL DEFAULT 'INFO', "metadata" JSONB,
  "actorId" TEXT, "actorName" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationalEvent_entityType_entityId_occurredAt_idx" ON "OperationalEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "OperationalEvent_accountId_occurredAt_idx" ON "OperationalEvent"("accountId", "occurredAt");
CREATE INDEX "OperationalEvent_eventType_occurredAt_idx" ON "OperationalEvent"("eventType", "occurredAt");

CREATE TABLE "WorkAssignment" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "entityNumber" TEXT,
  "accountId" TEXT, "stage" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "priority" INTEGER NOT NULL DEFAULT 50,
  "ownerId" TEXT, "ownerName" TEXT, "escalationId" TEXT, "nextAction" TEXT NOT NULL, "dueAt" TIMESTAMP(3),
  "blockedReason" TEXT, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkAssignment_entityType_entityId_key" ON "WorkAssignment"("entityType", "entityId");
CREATE INDEX "WorkAssignment_status_priority_dueAt_idx" ON "WorkAssignment"("status", "priority", "dueAt");
CREATE INDEX "WorkAssignment_ownerId_status_idx" ON "WorkAssignment"("ownerId", "status");
CREATE INDEX "WorkAssignment_stage_status_idx" ON "WorkAssignment"("stage", "status");

CREATE TABLE "IntegrationSyncState" (
  "id" TEXT NOT NULL, "integration" TEXT NOT NULL, "entityType" TEXT NOT NULL, "lastPullAt" TIMESTAMP(3),
  "lastWebhookAt" TIMESTAMP(3), "lastWriteAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "lastFailureAt" TIMESTAMP(3),
  "lastError" TEXT, "cursor" TEXT, "oldestQueuedAt" TIMESTAMP(3), "queuedCount" INTEGER NOT NULL DEFAULT 0,
  "deadLetterCount" INTEGER NOT NULL DEFAULT 0, "lastDurationMs" INTEGER, "lastProcessedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "IntegrationSyncState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationSyncState_integration_entityType_key" ON "IntegrationSyncState"("integration", "entityType");
CREATE INDEX "IntegrationSyncState_integration_lastSuccessAt_idx" ON "IntegrationSyncState"("integration", "lastSuccessAt");

CREATE TABLE "IntegrationException" (
  "id" TEXT NOT NULL, "integration" TEXT NOT NULL, "entityType" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  "externalNumber" TEXT, "exceptionType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "summary" TEXT NOT NULL,
  "payload" JSONB, "proposedMatches" JSONB, "confidence" DOUBLE PRECISION, "resolvedEntityId" TEXT, "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationException_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationException_integration_entityType_externalId_exceptionType_key" ON "IntegrationException"("integration", "entityType", "externalId", "exceptionType");
CREATE INDEX "IntegrationException_status_createdAt_idx" ON "IntegrationException"("status", "createdAt");
CREATE INDEX "IntegrationException_entityType_status_idx" ON "IntegrationException"("entityType", "status");

CREATE TABLE "TaskOutcome" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "outcomeType" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "nextAction" TEXT, "followUpAt" TIMESTAMP(3), "accountId" TEXT, "documentType" TEXT, "documentId" TEXT,
  "actorId" TEXT, "actorName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskOutcome_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskOutcome_taskId_createdAt_idx" ON "TaskOutcome"("taskId", "createdAt");
CREATE INDEX "TaskOutcome_accountId_createdAt_idx" ON "TaskOutcome"("accountId", "createdAt");
CREATE INDEX "TaskOutcome_outcomeType_createdAt_idx" ON "TaskOutcome"("outcomeType", "createdAt");

CREATE TABLE "ShippingPreset" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "length" DOUBLE PRECISION NOT NULL, "width" DOUBLE PRECISION NOT NULL,
  "height" DOUBLE PRECISION NOT NULL, "weight" DOUBLE PRECISION NOT NULL, "scope" TEXT NOT NULL DEFAULT 'COMPANY',
  "ownerId" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "isDefault" BOOLEAN NOT NULL DEFAULT false, "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingPreset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShippingPreset_name_scope_ownerId_key" ON "ShippingPreset"("name", "scope", "ownerId");
CREATE INDEX "ShippingPreset_scope_isActive_idx" ON "ShippingPreset"("scope", "isActive");
