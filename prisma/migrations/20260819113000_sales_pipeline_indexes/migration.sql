-- The sales pipeline resolves one primary contact for every visible account.
-- Without this index PostgreSQL scans the entire Contact table per account.
CREATE INDEX IF NOT EXISTS "Contact_accountId_isPrimary_idx"
ON "Contact"("accountId", "isPrimary");
