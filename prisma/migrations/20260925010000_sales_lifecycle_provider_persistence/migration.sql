CREATE TYPE "ProviderSyncState" AS ENUM ('PENDING', 'SYNCING', 'SUCCEEDED', 'FAILED', 'AMBIGUOUS');

ALTER TABLE "Account"
  ADD COLUMN "crmAccountId" TEXT,
  ADD COLUMN "booksCustomerId" TEXT,
  ADD COLUMN "providerSyncState" "ProviderSyncState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "providerSyncError" TEXT,
  ADD COLUMN "providerSyncedAt" TIMESTAMP(3);

ALTER TABLE "Contact"
  ADD COLUMN "crmContactId" TEXT,
  ADD COLUMN "booksContactId" TEXT,
  ADD COLUMN "providerSyncState" "ProviderSyncState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "providerSyncError" TEXT,
  ADD COLUMN "providerSyncedAt" TIMESTAMP(3);

ALTER TABLE "Lead"
  ADD COLUMN "crmLeadId" TEXT,
  ADD COLUMN "providerSyncState" "ProviderSyncState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "providerSyncError" TEXT,
  ADD COLUMN "providerSyncedAt" TIMESTAMP(3);

ALTER TABLE "Product"
  ADD COLUMN "booksItemId" TEXT,
  ADD COLUMN "unitCost" DOUBLE PRECISION,
  ADD COLUMN "costQuality" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "canDropship" BOOLEAN;

CREATE TABLE "ProviderWriteOperation" (
  "id" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "state" "ProviderSyncState" NOT NULL DEFAULT 'PENDING',
  "requestFingerprint" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerRecordIds" JSONB,
  "providerCode" TEXT,
  "providerMessage" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderWriteOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_crmAccountId_key" ON "Account"("crmAccountId");
CREATE UNIQUE INDEX "Account_booksCustomerId_key" ON "Account"("booksCustomerId");
CREATE UNIQUE INDEX "Contact_crmContactId_key" ON "Contact"("crmContactId");
CREATE UNIQUE INDEX "Contact_booksContactId_key" ON "Contact"("booksContactId");
CREATE UNIQUE INDEX "Lead_crmLeadId_key" ON "Lead"("crmLeadId");
CREATE UNIQUE INDEX "Product_booksItemId_key" ON "Product"("booksItemId");
CREATE UNIQUE INDEX "ProviderWriteOperation_operationKey_key" ON "ProviderWriteOperation"("operationKey");
CREATE INDEX "ProviderWriteOperation_state_nextAttemptAt_idx" ON "ProviderWriteOperation"("state", "nextAttemptAt");
CREATE INDEX "ProviderWriteOperation_entityType_entityId_idx" ON "ProviderWriteOperation"("entityType", "entityId");
