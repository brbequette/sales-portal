-- Migration 006: Add remaining Account columns declared in schema.prisma
-- These columns exist in the Prisma schema and are written/read by the sync and
-- account APIs, but were never added by an earlier migration. Billing address
-- columns in particular must always be available alongside the account record.
-- All statements are idempotent (IF NOT EXISTS) so they are safe to re-apply.

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "billingStreet" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "billingCity" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "billingState" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "billingZip" TEXT;

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "crewCount" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "bladesPerOrder" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "improvementPriority" TEXT;
