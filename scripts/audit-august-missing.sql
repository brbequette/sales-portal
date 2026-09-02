\pset pager off
\pset format unaligned
\pset fieldsep '|'
SELECT i."invoiceNumber", i."computedInvoiceNumber", i."zohoId", i."issueDate", i.status,
       i.amount, i.balance, i."pendingZohoFetch", i."pendingCostSync", i."lastSyncedAt",
       a.name
FROM "Invoice" i
JOIN "Account" a ON a.id = i."accountId"
WHERE i."zohoId" IN (
  '1254360000048980302', '1254360000048980276', '1254360000048980250',
  '1254360000048980089', '1254360000048721101', '1254360000048644193',
  '1254360000048644158'
)
ORDER BY i."zohoId";
