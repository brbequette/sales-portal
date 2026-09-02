\pset format unaligned
\pset fieldsep '|'
SELECT "invoiceNumber", "issueDate", "dueDate", "computedDeadCost", "computedDeadProfit",
       "computedProfit", "computedVigRate", "pendingZohoFetch", "syncConflict"
FROM "Invoice"
WHERE "zohoId" = '1254360000049628062';
