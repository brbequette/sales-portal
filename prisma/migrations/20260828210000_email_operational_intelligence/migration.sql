ALTER TABLE "Email" ALTER COLUMN "zohoMailId" DROP NOT NULL;
ALTER TABLE "Email" ALTER COLUMN "zohoAccountId" DROP NOT NULL;
ALTER TABLE "Email" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'ZOHO';
ALTER TABLE "Email" ADD COLUMN "externalMessageId" TEXT;
ALTER TABLE "Email" ADD COLUMN "internetMessageId" TEXT;
ALTER TABLE "Email" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "Email" ADD COLUMN "mailboxAddress" TEXT;
ALTER TABLE "Email" ADD COLUMN "emailMailboxId" TEXT;
ALTER TABLE "Email" ADD COLUMN "preview" TEXT;
ALTER TABLE "Email" ADD COLUMN "rawMetadata" JSONB;
ALTER TABLE "Email" ADD COLUMN "processedAt" TIMESTAMP(3);
ALTER TABLE "Email" ADD COLUMN "processingError" TEXT;

CREATE TABLE "EmailAttachment" (
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

CREATE TABLE "EmailMailbox" (
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

CREATE TABLE "EmailOperationalEvent" (
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

CREATE INDEX "Email_provider_receivedAt_idx" ON "Email"("provider", "receivedAt");
CREATE INDEX "Email_mailboxAddress_receivedAt_idx" ON "Email"("mailboxAddress", "receivedAt");
CREATE INDEX "Email_emailMailboxId_receivedAt_idx" ON "Email"("emailMailboxId", "receivedAt");
CREATE UNIQUE INDEX "Email_provider_mailboxAddress_externalMessageId_key" ON "Email"("provider", "mailboxAddress", "externalMessageId");
CREATE UNIQUE INDEX "EmailMailbox_address_key" ON "EmailMailbox"("address");
CREATE INDEX "EmailMailbox_userId_idx" ON "EmailMailbox"("userId");
CREATE INDEX "EmailMailbox_enabled_autoSync_idx" ON "EmailMailbox"("enabled", "autoSync");
CREATE UNIQUE INDEX "EmailAttachment_emailId_providerAttachmentId_key" ON "EmailAttachment"("emailId", "providerAttachmentId");
CREATE INDEX "EmailAttachment_emailId_idx" ON "EmailAttachment"("emailId");
CREATE INDEX "EmailAttachment_classification_idx" ON "EmailAttachment"("classification");
CREATE UNIQUE INDEX "EmailOperationalEvent_sourceFingerprint_key" ON "EmailOperationalEvent"("sourceFingerprint");
CREATE INDEX "EmailOperationalEvent_status_createdAt_idx" ON "EmailOperationalEvent"("status", "createdAt");
CREATE INDEX "EmailOperationalEvent_eventType_status_idx" ON "EmailOperationalEvent"("eventType", "status");
CREATE INDEX "EmailOperationalEvent_invoiceId_idx" ON "EmailOperationalEvent"("invoiceId");
CREATE INDEX "EmailOperationalEvent_salesOrderId_idx" ON "EmailOperationalEvent"("salesOrderId");
CREATE INDEX "EmailOperationalEvent_purchaseOrderId_idx" ON "EmailOperationalEvent"("purchaseOrderId");
CREATE INDEX "EmailOperationalEvent_packageId_idx" ON "EmailOperationalEvent"("packageId");
CREATE INDEX "EmailOperationalEvent_accountId_idx" ON "EmailOperationalEvent"("accountId");

ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Email" ADD CONSTRAINT "Email_emailMailboxId_fkey" FOREIGN KEY ("emailMailboxId") REFERENCES "EmailMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOperationalEvent" ADD CONSTRAINT "EmailOperationalEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
