\pset pager off
\pset format unaligned
\pset fieldsep '|'
SELECT
  COALESCE(i."invoiceNumber", i."computedInvoiceNumber") AS invoice_number,
  i.status,
  i.amount AS subtotal,
  COALESCE((i."rawData"->>'total')::numeric, 0) AS total,
  COALESCE((i."rawData"->>'tax_total')::numeric, 0) AS tax,
  COALESCE((i."rawData"->>'adjustment')::numeric, 0) AS adjustment,
  COALESCE((i."rawData"->>'shipping_charge')::numeric, 0) AS shipping_charge,
  COALESCE(i."paymentMade", 0) AS payment_made,
  COALESCE(i.balance, 0) AS balance,
  i."computedDeadCost",
  i."computedDeadProfit",
  i."computedProfit",
  i."computedUpfront",
  i."computedFinal",
  a.name AS account_name,
  i."lastSyncedAt",
  i."lastZohoModifiedTime"
FROM "Invoice" i
JOIN "Account" a ON a.id = i."accountId"
WHERE i."issueDate" >= DATE '2026-08-01'
  AND i."issueDate" < DATE '2026-09-01'
ORDER BY i."issueDate", invoice_number;
