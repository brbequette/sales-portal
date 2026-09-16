# Global-header production runtime audit — 2026-09-15

## Safety and source

The runtime audit queried the Netlify production `DATABASE_URL`, not the separate local Docker database used by PR #58. Every database query ran inside `BEGIN TRANSACTION READ ONLY`, used a 20-second statement timeout, and ended with `ROLLBACK`. No production record, sync state, Zoho record, reconciliation artifact, or deployment state was changed.

## Runtime data paths before this correction

The global header had one data path after PR #58: `GlobalTopBar` → `useGlobalTopBarData` → `GET /api/zoho-invoices?summary=true` → `calculateGlobalHeaderMetrics`. The request was authenticated but the summary ignored `documentScope`, so MASTER_ADMIN, ADMIN/administrator, manager, and ordinary salesperson sessions all received the same company dataset. The client requested `no-store`, but retained the last successful `stripStats` when a later request failed or returned an invalid payload.

The dashboard banner had a separate path: `DashboardView` → `useDashboardController` → `useDashboardData` → `GET /api/get-rep-stats`. The banner called `rawData.totals` “Company” totals. MASTER_ADMIN and ADMIN sessions were privileged and received company invoice totals; ordinary users were forced to their own rep ID by `getSessionScopedNetlifyUrl`/`get-rep-stats`, but the banner still said “Company.” This endpoint is invoice-only for its MTD subtotal. A second explicit `repId=all` request populated the lower company-detail panel, but did not feed the top banner.

## Exact Netlify production evidence

| Metric component | Documents | Subtotal/balance | Profit | Commission |
|---|---:|---:|---:|---:|
| MTD eligible invoices | 15 | $40,281.14 | $13,122.10 | $6,561.04 |
| MTD active uninvoiced sales orders | 2 | $4,499.75 | $1,799.90 | $899.95 |
| WEEKLY eligible invoices | 2 | $0.00 | — | — |
| WEEKLY active uninvoiced sales orders | 2 | $4,499.75 | — | — |
| PIPELINE open invoices | 68 | $161,554.58 balance | — | — |
| PIPELINE active uninvoiced sales orders | 2 | $4,499.75 subtotal | — | — |
| OVERDUE invoices | 42 | $79,138.92 balance | — | — |
| Unresolved invoices/orders | 0 | — | — | — |

The corrected company header totals are therefore WEEKLY $4,499.75, MTD $44,780.89, PROFIT $14,922.00, COMM $7,460.99, PIPELINE $166,054.33, and OVERDUE $79,138.92. Whole-dollar UI values are $4,500, $44,781, $14,922, $7,461, $166,054, and $79,139.

| Display | Deployed/observed | Corrected authoritative total |
|---|---:|---:|
| WEEKLY | $4,499.75 | $4,499.75 |
| MTD | $37,292.00 | $44,780.89 |
| PROFIT | $11,153 displayed | $14,922.00 |
| COMM | $899.95 | $7,460.99 |
| PIPELINE | $166,054.33 | $166,054.33 |
| OVERDUE | $79,138.92 | $79,138.92 |
| Dashboard MTD | $40,281.14, invoice-only | $44,780.89 from the shared header contract |

## Root causes of the three MTD figures

- PR #58’s $44,780.89 MTD happened to remain the correct Netlify company sales total, but its supporting audit came from the wrong production database (local Docker) and cannot substantiate Netlify profit, commission, pipeline, or overdue values.
- The deployed global-header $37,292.00 used a 07:00 UTC month boundary. Zoho document dates are date-only values stored at UTC midnight or noon, so valid September 1 midnight records were omitted. It did correctly include $4,499.75 of active uninvoiced orders.
- The dashboard $40,281.14 card was the 15 eligible invoices only. The corrected business rule requires the same two active uninvoiced sales orders as the header, so both surfaces now consume the shared $44,780.89 scoped summary. Its prior invoice query used a midnight month boundary and therefore included the September 1 records omitted by the deployed header.

Browser rounding explains cents only. Browser/server cache does not explain the numerical differences. There were no eligible quotes and quotes are excluded by contract. The differences came from data-environment mismatch, the 07:00 MTD boundary, invoice-only versus invoice-plus-order semantics, currency-formatted financial fields, and ambiguous/role-dependent labels.

## Explicit global-header contract

For MASTER_ADMIN, ADMIN/administrator, manager, and collections roles, every header metric is company-wide and every label begins with “Company.” For an ordinary salesperson, every metric is filtered to documents owned by or assigned to that user and every label begins with “My.” A single response cannot mix company and personal metrics.

WEEKLY and MTD use active invoices plus active uninvoiced sales orders. PROFIT and COMM are the MTD stored canonical profit and profit-based commission for those same documents; commission is independent of paid/payout timing. PIPELINE uses positive invoice balance plus active uninvoiced order subtotal. OVERDUE is the invoice-only pipeline subset explicitly overdue or past authoritative due date.

Draft, void/voided, declined, cancelled/canceled, orphaned, deleted, invoiced, billed, partially invoiced, invoice-linked, sync-conflict, and pending-fetch documents are excluded as applicable. Quotes are excluded. Invoice `issueDate`, order `orderDate`, and invoice `dueDate` are authoritative; `createdAt` is never substituted. Zoho date-only month/week boundaries start at UTC midnight. Currency-formatted stored values are parsed without approximation.

Both header and dashboard reads are `no-store`. The dashboard MTD card consumes the same validated summary response as the global header, including active uninvoiced sales orders, and rejects a response whose role scope differs from rep stats. The server response sets `Cache-Control: private, no-store`. If the header request fails, is non-2xx, is malformed, or lacks an explicit scope, the header stats are cleared instead of retaining stale values.
