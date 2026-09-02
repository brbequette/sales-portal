BEGIN;

CREATE TEMP TABLE call_account_repairs ON COMMIT DROP AS
WITH normalized_calls AS (
  SELECT id,
         "accountId" AS old_account_id,
         regexp_replace(CASE WHEN upper(direction) = 'INBOUND' THEN "fromNumber" ELSE "toNumber" END, '[^0-9]', '', 'g') AS phone
  FROM "CallLog"
), normalized_contacts AS (
  SELECT id AS contact_id,
         "accountId" AS account_id,
         right(regexp_replace(phone_value, '[^0-9]', '', 'g'), 10) AS phone
  FROM "Contact"
  CROSS JOIN LATERAL unnest(ARRAY[phone, "mobilePhone"]) phone_value
  WHERE phone_value IS NOT NULL
), unique_matches AS (
  SELECT c.id AS call_id,
         min(n.account_id) AS account_id,
         min(n.contact_id) AS contact_id,
         count(DISTINCT n.account_id) AS account_count
  FROM normalized_calls c
  JOIN normalized_contacts n ON n.phone = right(c.phone, 10) AND length(c.phone) >= 10
  GROUP BY c.id
)
SELECT u.call_id, u.account_id, u.contact_id
FROM unique_matches u
JOIN "CallLog" c ON c.id = u.call_id
WHERE u.account_count = 1 AND c."accountId" <> u.account_id;

UPDATE "CallLog" c
SET "accountId" = r.account_id, "contactId" = r.contact_id, "updatedAt" = NOW()
FROM call_account_repairs r
WHERE c.id = r.call_id;

UPDATE "CommunicationEvent" e
SET "accountId" = r.account_id, "contactId" = r.contact_id
FROM call_account_repairs r
WHERE e."sourceId" = r.call_id AND e."sourceType" IN ('CALL_LOG', 'CallLog');

UPDATE "SalesCommitment" s
SET "accountId" = r.account_id, "contactId" = r.contact_id
FROM call_account_repairs r
WHERE s."sourceId" = r.call_id AND s."sourceType" = 'CALL_LOG';

WITH normalized_calls AS (
  SELECT id, coalesce("zohoCallId", id) external_id,
         right(regexp_replace(CASE WHEN upper(direction) = 'INBOUND' THEN "fromNumber" ELSE "toNumber" END, '[^0-9]', '', 'g'), 10) phone
  FROM "CallLog"
), normalized_contacts AS (
  SELECT id AS contact_id, "accountId" AS account_id,
         right(regexp_replace(phone_value, '[^0-9]', '', 'g'), 10) phone
  FROM "Contact"
  CROSS JOIN LATERAL unnest(ARRAY[phone, "mobilePhone"]) phone_value
  WHERE phone_value IS NOT NULL
), review AS (
  SELECT c.id, c.external_id, c.phone,
         count(DISTINCT n.account_id) match_count,
         coalesce(jsonb_agg(DISTINCT jsonb_build_object('accountId', n.account_id, 'contactId', n.contact_id)) FILTER (WHERE n.account_id IS NOT NULL), '[]'::jsonb) proposed
  FROM normalized_calls c
  LEFT JOIN normalized_contacts n ON n.phone = c.phone
  GROUP BY c.id, c.external_id, c.phone
)
INSERT INTO "IntegrationException" (id, integration, "entityType", "externalId", "externalNumber", "exceptionType", status, summary, "proposedMatches", confidence, "createdAt", "updatedAt")
SELECT 'voice-match-' || md5(external_id), 'ZOHO_VOICE', 'CALL_LOG', external_id, phone, 'ACCOUNT_MATCH', 'OPEN',
       CASE WHEN match_count > 1 THEN 'Multiple accounts share the exact call phone number; administrator review required.' ELSE 'No account contact has the exact call phone number; administrator review required.' END,
       proposed, 0, NOW(), NOW()
FROM review
WHERE match_count <> 1
ON CONFLICT (integration, "entityType", "externalId", "exceptionType")
DO UPDATE SET status='OPEN', summary=EXCLUDED.summary, "externalNumber"=EXCLUDED."externalNumber", "proposedMatches"=EXCLUDED."proposedMatches", "updatedAt"=NOW();

SELECT count(*) AS repaired_calls FROM call_account_repairs;
COMMIT;
