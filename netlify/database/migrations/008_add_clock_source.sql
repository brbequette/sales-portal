-- Migration 008: Track whether a time entry was created manually or by geofence automation.
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "clockSource" TEXT DEFAULT 'manual';
