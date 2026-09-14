CREATE TABLE "SyncJob" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "requestedScope" JSONB NOT NULL,
  "writeBack" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncJobWriteAudit" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentRefHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "beforeHash" TEXT,
  "afterHash" TEXT,
  "errorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncJobWriteAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");
CREATE INDEX "SyncJob_actorId_createdAt_idx" ON "SyncJob"("actorId", "createdAt");
CREATE INDEX "SyncJobWriteAudit_jobId_status_idx" ON "SyncJobWriteAudit"("jobId", "status");
CREATE UNIQUE INDEX "SyncJobWriteAudit_jobId_documentType_documentRefHash_key" ON "SyncJobWriteAudit"("jobId", "documentType", "documentRefHash");
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyncJobWriteAudit" ADD CONSTRAINT "SyncJobWriteAudit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
