-- Additive, idempotent recovery for objects proven absent from production logs.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_leadId_idx" ON "Task"("leadId");
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "mailboxAddress" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'ZOHO';
CREATE UNIQUE INDEX IF NOT EXISTS "Email_provider_mailboxAddress_externalMessageId_key" ON "Email"("provider", "mailboxAddress", "externalMessageId");
CREATE INDEX IF NOT EXISTS "Email_provider_receivedAt_idx" ON "Email"("provider", "receivedAt");
CREATE INDEX IF NOT EXISTS "Email_mailboxAddress_receivedAt_idx" ON "Email"("mailboxAddress", "receivedAt");
CREATE TABLE IF NOT EXISTS "ShippingPreset" (
  "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "length" DOUBLE PRECISION NOT NULL,
  "width" DOUBLE PRECISION NOT NULL, "height" DOUBLE PRECISION NOT NULL, "weight" DOUBLE PRECISION NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'COMPANY', "ownerId" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false, "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingPreset_name_scope_ownerId_key" ON "ShippingPreset"("name", "scope", "ownerId");
CREATE INDEX IF NOT EXISTS "ShippingPreset_scope_isActive_idx" ON "ShippingPreset"("scope", "isActive");
CREATE TABLE IF NOT EXISTS "OperationalAction" (
  "id" TEXT NOT NULL PRIMARY KEY, "idempotencyKey" TEXT NOT NULL, "actionType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "entityNumber" TEXT, "accountId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "payload" JSONB, "result" JSONB, "errorCode" TEXT,
  "errorMessage" TEXT, "attemptCount" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "actorId" TEXT,
  "actorName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalAction_idempotencyKey_key" ON "OperationalAction"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "OperationalAction_status_nextAttemptAt_idx" ON "OperationalAction"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OperationalAction_entityType_entityId_createdAt_idx" ON "OperationalAction"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalAction_accountId_createdAt_idx" ON "OperationalAction"("accountId", "createdAt");
