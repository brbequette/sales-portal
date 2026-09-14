CREATE TABLE "ReconciliationArtifactRegistration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "artifactId" TEXT NOT NULL UNIQUE,
  "fingerprint" TEXT NOT NULL UNIQUE,
  "aggregate" JSONB NOT NULL,
  "uploaderUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  "validationStatus" TEXT NOT NULL,
  "productionCommit" TEXT,
  "approvalStatus" TEXT NOT NULL DEFAULT 'REGISTERED_UNAPPROVED'
);
CREATE INDEX "ReconciliationArtifactRegistration_uploaderUserId_createdAt_idx" ON "ReconciliationArtifactRegistration"("uploaderUserId", "createdAt");
