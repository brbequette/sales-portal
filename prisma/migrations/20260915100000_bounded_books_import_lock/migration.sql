CREATE TABLE IF NOT EXISTS "BoundedBooksImportLock" (
  "key" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoundedBooksImportLock_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "BoundedBooksImportLock_expiresAt_idx" ON "BoundedBooksImportLock"("expiresAt");
