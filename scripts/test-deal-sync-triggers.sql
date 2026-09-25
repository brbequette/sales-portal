-- Run against a disposable database after the complete migration chain.
BEGIN;
INSERT INTO "User" (id,email,"updatedAt") VALUES ('deal-test-user','deal-test@example.invalid',now());
INSERT INTO "Account" (id,"zohoId",name,"ownerId","updatedAt") VALUES ('deal-test-account','test-account','Fixture','deal-test-user',now());
INSERT INTO "Invoice" (id,"zohoId","accountId",amount,status,"issueDate","updatedAt") VALUES
  ('deal-test-invoice','test-invoice','deal-test-account',100,'sent',now(),now()),
  ('deal-test-invoice-2','test-invoice-2','deal-test-account',200,'sent',now(),now());
DO $$ BEGIN
  IF (SELECT count(*) FROM "DealSyncJob" WHERE "invoiceId" LIKE 'deal-test-invoice%') != 2 THEN RAISE EXCEPTION 'Missing insert queue'; END IF;
END $$;
UPDATE "DealSyncJob" SET "checkedAt" = clock_timestamp() WHERE "invoiceId" LIKE 'deal-test-invoice%';
INSERT INTO "Payment" (id,"zohoId","invoiceDbId",amount,"updatedAt") VALUES ('deal-test-payment','test-payment','deal-test-invoice',30,now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DealSyncJob" WHERE "invoiceId"='deal-test-invoice' AND "changedAt">"checkedAt") THEN RAISE EXCEPTION 'Payment did not invalidate'; END IF;
END $$;
UPDATE "DealSyncJob" SET "checkedAt" = clock_timestamp() WHERE "invoiceId" LIKE 'deal-test-invoice%';
UPDATE "Payment" SET "invoiceDbId"='deal-test-invoice-2' WHERE id='deal-test-payment';
DO $$ BEGIN
  IF (SELECT count(*) FROM "DealSyncJob" WHERE "invoiceId" LIKE 'deal-test-invoice%' AND "changedAt">"checkedAt") != 2 THEN RAISE EXCEPTION 'Moved payment did not invalidate both invoices'; END IF;
END $$;
UPDATE "DealSyncJob" SET "checkedAt"=clock_timestamp() WHERE "invoiceId"='deal-test-invoice-2';
DELETE FROM "Payment" WHERE id='deal-test-payment';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DealSyncJob" WHERE "invoiceId"='deal-test-invoice-2' AND "changedAt">"checkedAt") THEN RAISE EXCEPTION 'Deleted payment did not invalidate'; END IF;
END $$;
UPDATE "Invoice" SET status='paid', balance=0 WHERE id='deal-test-invoice';
DO $$ BEGIN
  IF (SELECT count(*) FROM "DealSyncJob" WHERE "invoiceId"='deal-test-invoice') != 1 THEN RAISE EXCEPTION 'Duplicate queue job'; END IF;
END $$;
ROLLBACK;
SELECT 'DEAL_SYNC_TRIGGER_TESTS_PASS' AS result;
