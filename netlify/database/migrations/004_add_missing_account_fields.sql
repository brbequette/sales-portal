-- Migration 004: Add missing Account fields declared in schema.prisma
-- These columns exist in the Prisma schema but were never added to the database.

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "tags" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "quality" TEXT NOT NULL DEFAULT 'WARM';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "lastCalledAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "timeZone" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "bladeSizes" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "materialsCut" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "currentSupplier" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "averageBladeCost" TEXT;

-- Add indexes for new columns that appear in queries
CREATE INDEX IF NOT EXISTS "Account_status_idx" ON "Account"("status");
CREATE INDEX IF NOT EXISTS "Account_ownerId_idx" ON "Account"("ownerId");
