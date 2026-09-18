CREATE TABLE "LocalMasterCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "loginIdentifier" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "mustRotatePassword" BOOLEAN NOT NULL DEFAULT true,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "passwordVersion" INTEGER NOT NULL DEFAULT 1,
  "lastLoginAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalMasterCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterAdminLoginThrottle" (
  "key" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastFailureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MasterAdminLoginThrottle_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "LocalMasterCredential_userId_key" ON "LocalMasterCredential"("userId");
CREATE UNIQUE INDEX "LocalMasterCredential_loginIdentifier_key" ON "LocalMasterCredential"("loginIdentifier");
CREATE INDEX "LocalMasterCredential_active_lockedUntil_idx" ON "LocalMasterCredential"("active", "lockedUntil");
CREATE INDEX "MasterAdminLoginThrottle_lockedUntil_idx" ON "MasterAdminLoginThrottle"("lockedUntil");

ALTER TABLE "LocalMasterCredential"
  ADD CONSTRAINT "LocalMasterCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
