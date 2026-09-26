\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE "PurchaseOrder" (id TEXT PRIMARY KEY, "salesOrderId" TEXT, "salesOrderNumber" TEXT, total NUMERIC);

-- INSERT_MIGRATION_HERE
INSERT INTO "PurchaseOrder" VALUES ('inferred', 'SO-ID', 'SO-42', 100, jsonb_build_object('source','INFERRED','salesOrderId','SO-ID','confidence','CORROBORATED','fingerprint',repeat('a',64),'verifiedAt','2026-09-26T00:00:00Z'));
-- Repeated provider sync with no ID preserves provenance/link while allowing unrelated fields.
UPDATE "PurchaseOrder" SET "salesOrderId"=NULL, "salesOrderNumber"=NULL, total=101 WHERE id='inferred';
UPDATE "PurchaseOrder" SET "salesOrderId"=NULL, "salesOrderNumber"='provider blank reference' WHERE id='inferred';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE id='inferred' AND "salesOrderId"='SO-ID' AND "salesOrderNumber"='SO-42' AND total=101) THEN RAISE EXCEPTION 'preservation failed'; END IF;
END $$;
-- A provider ID agreeing with the audited link is accepted; evidence remains.
UPDATE "PurchaseOrder" SET "salesOrderId"='SO-ID', "salesOrderNumber"='SO-42' WHERE id='inferred';
DO $$ BEGIN
 BEGIN UPDATE "PurchaseOrder" SET "salesOrderId"='CONFLICT' WHERE id='inferred'; RAISE EXCEPTION 'conflict accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE "PurchaseOrder" SET "salesOrderLinkEvidence"=NULL WHERE id='inferred'; RAISE EXCEPTION 'evidence erased'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE "PurchaseOrder" SET "salesOrderNumber"='OTHER' WHERE id='inferred'; RAISE EXCEPTION 'number conflict accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO "PurchaseOrder" VALUES ('invalid','X','Y',0,'{}'); RAISE EXCEPTION 'invalid evidence accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Existing unaudited records still accept authoritative provider IDs.
INSERT INTO "PurchaseOrder" (id,total) VALUES ('provider',0);
UPDATE "PurchaseOrder" SET "salesOrderId"='DIRECT-ID', "salesOrderNumber"='SO-DIRECT' WHERE id='provider';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE id='provider' AND "salesOrderId"='DIRECT-ID' AND "salesOrderLinkEvidence" IS NULL) THEN RAISE EXCEPTION 'provider takeover failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE id='inferred' AND "salesOrderId"='SO-ID' AND "salesOrderLinkEvidence" IS NOT NULL) THEN RAISE EXCEPTION 'conflict damaged link'; END IF;
END $$;
ROLLBACK;
SELECT 'PO trigger checks passed' AS result;
