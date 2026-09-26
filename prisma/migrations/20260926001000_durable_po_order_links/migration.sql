-- Protect audited local links across every existing Books import/upsert path.
ALTER TABLE "PurchaseOrder" ADD COLUMN "salesOrderLinkEvidence" JSONB;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_inferred_link_evidence_check"
CHECK ("salesOrderLinkEvidence" IS NULL OR (
  jsonb_typeof("salesOrderLinkEvidence") = 'object'
  AND "salesOrderLinkEvidence"->>'source' = 'INFERRED'
  AND "salesOrderLinkEvidence"->>'salesOrderId' = "salesOrderId"
  AND "salesOrderLinkEvidence"->>'confidence' = 'CORROBORATED'
  AND "salesOrderLinkEvidence"->>'fingerprint' ~ '^[a-f0-9]{64}$'
  AND length("salesOrderLinkEvidence"->>'verifiedAt') > 0
) IS TRUE);

CREATE FUNCTION titan_preserve_inferred_po_order_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."salesOrderLinkEvidence" IS NOT NULL THEN
    IF NEW."salesOrderLinkEvidence" IS DISTINCT FROM OLD."salesOrderLinkEvidence" THEN
      RAISE EXCEPTION 'PO_ORDER_LINK_EVIDENCE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF NEW."salesOrderId" IS NULL THEN
      NEW."salesOrderId" := OLD."salesOrderId";
      NEW."salesOrderNumber" := OLD."salesOrderNumber";
    ELSIF NEW."salesOrderId" IS DISTINCT FROM OLD."salesOrderId" THEN
      RAISE EXCEPTION 'PO_ORDER_LINK_CONFLICT' USING ERRCODE = '23514';
    ELSIF NEW."salesOrderNumber" IS NULL THEN
      NEW."salesOrderNumber" := OLD."salesOrderNumber";
    ELSIF NEW."salesOrderNumber" IS DISTINCT FROM OLD."salesOrderNumber" THEN
      RAISE EXCEPTION 'PO_ORDER_NUMBER_CONFLICT' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_inferred_po_order_link
BEFORE UPDATE OF "salesOrderId", "salesOrderNumber", "salesOrderLinkEvidence" ON "PurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION titan_preserve_inferred_po_order_link();
