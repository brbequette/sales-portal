# Production global-header financial audit — 2026-09-15

## Safety and evidence source

The evidence query ran against the authoritative local Docker production PostgreSQL database inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`. No Full Sync, reconciliation Apply, Zoho request/write, or database mutation was run. All totals below are from locally stored Invoice, SalesOrder, and Quote records as observed on 2026-09-15 in America/Phoenix.

## Exact before/after totals

| Header figure | Before | Corrected | Difference | Production evidence |
|---|---:|---:|---:|---|
| WEEKLY | $4,499.75 | $4,499.75 | $0.00 | 2 active invoices totaling $0.00 plus 2 active uninvoiced sales orders totaling $4,499.75; no eligible recent estimates |
| MTD | $74,519.72 | $44,780.89 | -$29,738.83 | Before included 11 already-invoiced sales orders ($29,738.83) in addition to 15 invoices and 2 open orders |
| PROFIT | $13,122.12 | $13,122.12 | $0.00 | Excluded converted orders carried no additional stored profit, so the eligibility correction has no current-dollar effect |
| COMM | $4,193.52 | $6,561.04 | +$2,367.52 | Before summed earned upfront/final payment portions; corrected total uses stored canonical profit-based commission independent of payment status |
| PIPELINE | $188,786.42 | $165,175.77 | -$23,610.65 | Removed 2 orphaned orders ($20,460.95) and 1 invoice-linked partially-invoiced order ($3,149.70) |
| OVERDUE | $72,243.18 | $72,243.18 | $0.00 | 40 eligible invoices; current records contain no invalid/unresolved overdue difference |

The compact header rounds these cent-accurate values to whole dollars only at display time.

## Authoritative inclusion and exclusion rules

All sales totals use the document subtotal, not grand total, balance, or a UI approximation. Stored `sub_total`, `subTotal`, or `subtotal` is preferred, with the document amount used only when the stored subtotal is absent/zero.

Dates are Arizona calendar periods. Invoice eligibility uses `issueDate`; sales-order eligibility uses `orderDate`. There is no `createdAt` fallback. WEEKLY is Monday 00:00 UTC through the following Monday 00:00 UTC, matching date-only Zoho storage and the existing Arizona-week rule. MTD is the first day at 07:00 UTC through the next month at 07:00 UTC.

WEEKLY and MTD include active invoices plus active, uninvoiced sales orders. Estimates/quotes are excluded. Sales orders are excluded when their status is invoiced, billed, or partially invoiced, or when an invoice links to the order by authoritative Zoho ID or document number. This prevents converted-document double counting.

Draft, void, voided, declined, cancelled/canceled, orphaned, and deleted documents are excluded. Records with `syncConflict=true` or `pendingZohoFetch=true` are unresolved and excluded. The established Paul Gencuski/Genkuski non-salesperson exclusion is retained for WEEKLY, MTD, PROFIT, and COMM.

PROFIT uses the denormalized invoice `computedProfit` when present, then the canonical stored profit field. Sales orders use their canonical stored profit. Missing values remain zero; the header does not invent profit or run a cost processor.

COMM uses the canonical stored document commission derived from profit. It does not use `computedUpfront + computedFinal`, paid status, or payout timing. This is a performance/accrual figure, not a payment-issued figure.

PIPELINE includes each eligible invoice's positive outstanding `balance` plus the subtotal of each active uninvoiced sales order, regardless of transaction date. Paid/closed invoices are excluded. The same terminal, unresolved, orphan, and conversion rules apply. Quotes are excluded.

OVERDUE is the eligible invoice-only subset of PIPELINE whose normalized status is overdue or whose authoritative `dueDate` is earlier than the observation time. It sums outstanding balance, not subtotal. Sales orders and invoices without a past due date or explicit overdue status are excluded.

## Cache/freshness correction

Previously the header combined WEEKLY from one endpoint/cache with the other five figures from another request, so values could represent different database moments. The corrected header fetches one atomic production-database summary, explicitly uses `cache: "no-store"`, returns `Cache-Control: private, no-store`, refreshes every 15 seconds while mounted, and refreshes immediately when the tab becomes visible.
