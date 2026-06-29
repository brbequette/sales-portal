ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "inactivityPeriods" JSONB DEFAULT '[]'::jsonb;
