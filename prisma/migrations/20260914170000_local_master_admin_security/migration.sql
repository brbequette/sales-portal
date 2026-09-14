-- Additive local master-admin authentication and delegation state.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authType" TEXT NOT NULL DEFAULT 'ZOHO';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustRotatePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSalesperson" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "AuthAuditEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "subjectUserId" TEXT,
  "reasonCode" TEXT,
  "entityType" TEXT,
  "entityIdHash" TEXT,
  "changedFields" JSONB,
  "requestId" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuthAuditEvent_eventType_createdAt_idx" ON "AuthAuditEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthAuditEvent_actorUserId_createdAt_idx" ON "AuthAuditEvent"("actorUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "DelegatedSession" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "sessionId" TEXT,
  CONSTRAINT "DelegatedSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DelegatedSession_actorUserId_expiresAt_idx" ON "DelegatedSession"("actorUserId", "expiresAt");
CREATE INDEX IF NOT EXISTS "DelegatedSession_subjectUserId_expiresAt_idx" ON "DelegatedSession"("subjectUserId", "expiresAt");
