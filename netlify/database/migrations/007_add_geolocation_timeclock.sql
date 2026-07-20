-- Migration 007: Add geolocation fields for timeclock geofencing
-- GPS is captured ONLY at clock-in and clock-out — not tracked continuously.

-- Add geolocation fields to TimeEntry
ALTER TABLE "TimeEntry" ADD COLUMN "clockInLat" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockInLng" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockInAccuracy" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockOutLat" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockOutLng" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockOutAccuracy" DOUBLE PRECISION;
ALTER TABLE "TimeEntry" ADD COLUMN "clockInLocation" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "clockOutLocation" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "locationStatus" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "clockSource" TEXT DEFAULT 'manual';

-- Create GeofenceLocation table
CREATE TABLE "GeofenceLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GeofenceLocation_pkey" PRIMARY KEY ("id")
);
