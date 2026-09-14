-- Additive, idempotent correction after the prior recovery migration.
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "internetMessageId" TEXT;
