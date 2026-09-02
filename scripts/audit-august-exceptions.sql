\pset pager off
\pset format unaligned
\pset fieldsep '|'
SELECT COALESCE(i."invoiceNumber", i."computedInvoiceNumber") AS invoice_number,
       i."zohoId",
       jsonb_pretty(i."rawData"::jsonb) AS raw_data
FROM "Invoice" i
WHERE COALESCE(i."invoiceNumber", i."computedInvoiceNumber") IN
  ('10947', '10948', '10950', '10951', '10958', '10967', '10968', '10969', '10970')
ORDER BY invoice_number;
