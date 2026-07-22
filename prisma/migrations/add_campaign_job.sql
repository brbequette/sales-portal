-- Migration: Add CampaignJob table
-- Run this via Admin > DB Scripts or /api/run-sql

CREATE TABLE IF NOT EXISTS "CampaignJob" (
  "id"           TEXT NOT NULL,
  "authorId"     TEXT NOT NULL,
  "blastId"      TEXT,
  "status"       TEXT NOT NULL DEFAULT 'RUNNING',
  "campaignName" TEXT NOT NULL,
  "channel"      TEXT NOT NULL DEFAULT 'SMS',
  "text"         TEXT NOT NULL DEFAULT '',
  "imageUrl"     TEXT,
  "fromNumber"   TEXT,
  "accountIds"   JSONB NOT NULL,
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "total"        INTEGER NOT NULL,
  "sentCount"    INTEGER NOT NULL DEFAULT 0,
  "failedCount"  INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignJob_authorId_idx" ON "CampaignJob"("authorId");
CREATE INDEX IF NOT EXISTS "CampaignJob_status_idx" ON "CampaignJob"("status");

ALTER TABLE "CampaignJob"
  ADD CONSTRAINT "CampaignJob_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
