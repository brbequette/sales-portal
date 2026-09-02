\pset pager off
\pset format unaligned
\pset fieldsep '|'
WITH august AS (
  SELECT * FROM "Invoice"
  WHERE "issueDate" >= DATE '2026-08-01' AND "issueDate" < DATE '2026-09-01'
), active AS (
  SELECT * FROM august WHERE lower(status) NOT IN ('draft', 'void', 'voided', 'cancelled', 'canceled', 'declined')
)
SELECT 'all' AS scope, count(*) AS invoices, round(sum(amount)::numeric,2) AS subtotal,
       round(sum(COALESCE(balance,0))::numeric,2) AS balance,
       round(sum(COALESCE("computedDeadCost",0))::numeric,2) AS dead_cost,
       round(sum(COALESCE("computedDeadProfit",0))::numeric,2) AS dead_profit,
       round(sum(COALESCE("computedProfit",0))::numeric,2) AS net_profit,
       round(sum(COALESCE("computedUpfront",0)+COALESCE("computedFinal",0))::numeric,2) AS commission
FROM august
UNION ALL
SELECT 'active', count(*), round(sum(amount)::numeric,2), round(sum(COALESCE(balance,0))::numeric,2),
       round(sum(COALESCE("computedDeadCost",0))::numeric,2), round(sum(COALESCE("computedDeadProfit",0))::numeric,2),
       round(sum(COALESCE("computedProfit",0))::numeric,2),
       round(sum(COALESCE("computedUpfront",0)+COALESCE("computedFinal",0))::numeric,2)
FROM active;

SELECT COALESCE("computedSalesperson", 'UNASSIGNED') AS salesperson, count(*) AS invoices,
       round(sum(amount)::numeric,2) AS subtotal,
       round(sum(COALESCE("computedDeadCost",0))::numeric,2) AS dead_cost,
       round(sum(COALESCE("computedDeadProfit",0))::numeric,2) AS dead_profit,
       round(sum(COALESCE("computedProfit",0))::numeric,2) AS net_profit,
       round(sum(COALESCE("computedUpfront",0)+COALESCE("computedFinal",0))::numeric,2) AS commission
FROM "Invoice"
WHERE "issueDate" >= DATE '2026-08-01' AND "issueDate" < DATE '2026-09-01'
  AND lower(status) NOT IN ('draft', 'void', 'voided', 'cancelled', 'canceled', 'declined')
GROUP BY COALESCE("computedSalesperson", 'UNASSIGNED') ORDER BY subtotal DESC;

SELECT
  count(*) FILTER (WHERE "computedDeadCost" IS NULL) AS missing_dead_cost,
  count(*) FILTER (WHERE "computedDeadProfit" IS NULL) AS missing_dead_profit,
  count(*) FILTER (WHERE "computedProfit" IS NULL) AS missing_net_profit,
  count(*) FILTER (WHERE "computedSalesperson" IS NULL OR trim("computedSalesperson")='') AS missing_salesperson,
  count(*) FILTER (WHERE "syncConflict") AS conflicts,
  count(*) FILTER (WHERE "pendingZohoFetch") AS pending_fetch,
  count(*) FILTER (WHERE "pendingCostSync") AS pending_cost
FROM "Invoice"
WHERE "issueDate" >= DATE '2026-08-01' AND "issueDate" < DATE '2026-09-01';
