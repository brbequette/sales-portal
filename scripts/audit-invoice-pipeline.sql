\pset pager off

SELECT
  count(*) AS total_invoices,
  count(*) FILTER (WHERE "costsCalculatedAt" IS NULL) AS never_costed,
  count(*) FILTER (WHERE "pendingCostSync") AS pending_cost_sync,
  count(*) FILTER (WHERE "pendingZohoFetch") AS pending_zoho_fetch,
  count(*) FILTER (WHERE "syncConflict") AS sync_conflicts,
  count(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM "LineItem" li WHERE li."invoiceId" = i.id
    )
  ) AS without_line_items
FROM "Invoice" i;

SELECT status, count(*) AS never_costed
FROM "Invoice"
WHERE "costsCalculatedAt" IS NULL
GROUP BY status
ORDER BY never_costed DESC;

SELECT
  "zohoId",
  status,
  "updatedAt",
  "costsCalculatedAt",
  "lastCostSyncAt",
  "pendingCostSync",
  "pendingZohoFetch",
  "syncConflict",
  (SELECT count(*) FROM "LineItem" li WHERE li."invoiceId" = i.id) AS line_items
FROM "Invoice" i
ORDER BY "updatedAt" DESC
LIMIT 15;

SELECT key, value, "updatedAt"
FROM "SystemSetting"
WHERE key IN ('pause_mass_zoho_updates', 'zoho_sync_enabled', 'books_sync_enabled')
ORDER BY key;
