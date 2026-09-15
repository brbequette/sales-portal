CREATE TABLE IF NOT EXISTS "BoundedBooksImportJob" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelRequestedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCategory" TEXT,
  CONSTRAINT "BoundedBooksImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BoundedBooksImportJob_status_startedAt_idx" ON "BoundedBooksImportJob" ("status", "startedAt");
