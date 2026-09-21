# Zoho Books line-item header compatibility audit

Date: 2026-09-21  
Branch/base: `codex/zoho-line-item-header-compatibility` / `d445cec3c71840515934767abb81ada8a60df351`  
Safety boundary: source and sanitized fixtures only. The Zoho feature remained disabled; no production, database, import, sync, conversion, or Zoho mutation was run.

## Confirmed contract

Official Zoho Books documentation confirms `line_item_category` values `line_item`, `header`, and `subtotal`, optional category on legacy product rows, header descriptions, and `item_order`. The shared contract in `src/lib/zoho-line-items.ts` recognizes only those exact strings. It does not trim, lowercase, or otherwise coerce remote values. Missing/null/empty category is legacy financial behavior. Unknown strings and malformed values remain visible, financial, and diagnostically classified as unsupported rather than being silently discarded as headers. This fail-visible choice is intentionally conservative; Zoho semantics for any future category are **UNVERIFIED**.

`header` and documented structural `subtotal` rows are retained in JSON snapshots and ordered presentation/round-trip paths, but excluded from product, cost, financial, inventory, purchasing, fulfillment, shipping, return, recovery, and relational `LineItem` paths. The application does not start creating structural rows.

## Complete repository inventory

### Financial, commission, cost, tariff, recovery, and reporting readers — corrected

- `netlify/functions/lib/cost-calculations.ts`, `src/lib/cost-calculations.ts`
- `netlify/functions/process-invoice-costs.ts`, `netlify/functions/bulk-process-costs.ts`, `netlify/functions/batch-tariff-update.ts`
- `src/app/api/admin/recalculate-missing-costs/route.ts`, `src/app/api/batch-tariff-update/route.ts`
- `netlify/functions/get-documents.ts`, `src/app/api/get-documents/route.ts`
- `netlify/functions/get-commissions.ts`, `src/app/api/commissions/monthly-sales-sheet/route.ts`
- `netlify/functions/zoho-invoices.ts`, `src/app/api/zoho-invoices/route.ts`
- `netlify/functions/get-account-purchases.ts`, `netlify/functions/get-product-purchases.ts`
- `tools/financial-reconciliation/reconciliation-cost-sources.mjs`

Confirmed unsafe assumptions were raw iteration/reduction, raw first-line salesperson lookup, raw line counts, and treating every historical JSON row as a cost candidate. All now cross the shared classifier.

### Persistence, bounded import, webhook, and sync ingestion — safe storage plus corrected relational persistence

- `src/lib/sync-engine.ts` excludes structural rows from relational `LineItem` creation while preserving the original JSON array.
- `netlify/functions/daily-books-sync.ts`, `netlify/functions/zoho-books-webhook.ts`, `netlify/functions/bulk-process-costs.ts`, `netlify/functions/process-invoice-costs.ts`, and `netlify/functions/admin-verify-so-costs.ts` preserve raw JSON and route calculation/relational persistence through the shared classifier.
- `netlify/functions/get-invoice-details.ts` preserves structural rows for display/round-trip integrity and does not financially aggregate them.
- `netlify/functions/lib/bulk-sync.ts`, `netlify/functions/admin-books-sync-packages.ts`, `netlify/functions/admin-books-sync-packages-background.ts`, `src/app/api/admin/books/sync-packages/route.ts`, and `src/app/api/sync-now/route.ts` are JSON storage-only call sites; operational consumers now filter the stored rows.
- `netlify/functions/import-books-csv.ts`, `scripts/process_exports.ts`, and `scripts/backfill/backfill_local.js` create legacy product rows from columnar exports; they do not ingest Zoho structural categories.

No extra fetch was introduced. Existing detail fetches and bounded ranges are unchanged.

### Fulfillment, shipping, purchasing, inventory, returns, and matching — corrected

- `netlify/functions/zoho-fulfillment.ts`, `netlify/functions/shipping.ts`, `src/app/api/shipping/route.ts`, `src/app/api/shipping/po-details/route.ts`
- `netlify/functions/easyship-return.ts`, `netlify/functions/zoho-credit-note.ts`
- `src/app/api/admin/shipping/missing-shipping/route.ts`, `src/app/api/admin/orphans/suggest-matches/match-score.ts`
- `src/app/shipping/page.tsx`, `src/app/processing/page.tsx`

Confirmed unsafe assumptions included packing/shipping every row, matching a header as a PO/invoice product, returning header quantity, and creating credit-note lines from every invoice row.

### Outbound payloads and conversion — corrected or proven unaffected

- `netlify/functions/create-transaction.ts` does not create headers for app-originated transactions; remote structural rows are preserved with only category, ID (when present), description, and valid order.
- `netlify/functions/zoho-update-line-items.ts` and `netlify/functions/zoho-apply-discount.ts` preserve existing structural rows without injecting product, quantity, price, tax, cost, or inventory fields.
- `netlify/functions/zoho-credit-note.ts` and `netlify/functions/zoho-fulfillment.ts` intentionally send financial rows only.
- `netlify/functions/automation-engine.ts` builds rows exclusively from application subscription products and does not round-trip Zoho rows.
- `src/components/useOrderBuilderData.ts` builds new application product rows only.
- `src/app/api/admin/run-e2e-test/route.ts` is synthetic test-only transaction construction and was not run.

Outbound support for headers is documented by Zoho for the reviewed sales-document modules. Whether all tenant-specific custom-field/discount combinations can round-trip a mixed header/subtotal payload remains **UNVERIFIED** until sandbox acceptance testing after the setting is enabled. The code therefore preserves existing structural rows only and never originates them.

### Presentation, print/PDF, dashboards, goals, and counts

- `src/components/InvoiceDetailsModal.tsx` and `src/components/DocumentPopoutContent.tsx` preserve ordered structural descriptions in document presentation while excluding them from cost fallback and fulfillment inputs.
- `src/components/KpiBreakdownModal.tsx` and `src/components/PayPeriodStatementModal.tsx` use financial rows for product breakdown/counts.
- `netlify/functions/get-rep-stats.ts`, global-header metrics, commission snapshot readers, PDF cache/download functions, and document-level goal/deal counts use stored document totals/snapshots rather than raw line-item aggregation; they are unaffected.
- Zoho authoritative document totals are preserved. A header does not create a document, deal, goal contribution, or financial line.

### Manual/legacy diagnostics and prohibited mutation utilities — inventoried, not activation paths

- Read-only counts/diagnostics: `scripts/audit-zoho-august-details.mjs`, `scripts/check-db.mjs`, `scripts/find-uncached-doc.ts` count raw response/storage rows and do not calculate money or create products.
- Shared-calculator callers: `scripts/recalculate_all_vig_costs.ts`, `scripts/reconcile-and-sync-docs.ts`, `scripts/test_advanced_features.ts`, and `scripts/test_full_system_e2e.ts` route financial work through the corrected calculator; none was run.
- Legacy mutation scripts `scripts/backfill_document_costs_and_vig.js` and `scripts/reconcile_pre_august_2024_payouts.js` contain independent historical raw-line reductions. They are not scheduled, imported, or reachable from application/runtime routes and remain prohibited operational tools. They must not be run after activation without a separately reviewed modernization. This is an explicit residual operational guard, not a portal request-path exposure.
- Package test fixtures (`scripts/test_package_sync_errors.ts`) and CSV-only backfill construction do not consume header-enabled Zoho transaction responses.

## API-call conservation

The classifier is pure and contains no `fetch`, Prisma call, token access, or provider client. It consumes the existing array at each boundary.

| Workload | Before | After | Added by header compatibility |
|---|---:|---:|---:|
| One already-fetched document | 0 classification calls to Zoho | 0 | 0 |
| N already-fetched documents | 0 classification calls to Zoho | 0 | 0 |
| Existing detail/import/webhook invocation | Existing provider calls unchanged | Same | 0 |
| Dashboard/document stored-data display | 0 | 0 | 0 |

## Fixture conservation

Header-free and header-inserted sanitized fixtures both produce revenue `$44,780.89`, profit `$14,121.58`, 17 eligible documents (15 invoices and two uninvoiced sales orders), target `$115,500`, progress `12.2%` (profit/target), and Monty's stored VIG `1.0`. Structural rows add zero to all tested financial/operational aggregates.

## Activation and rollback

Activation prerequisites:

1. Merge and deploy this PR; confirm focused contracts, production build, and function bundles pass.
2. Keep legacy mutation scripts above administratively prohibited.
3. Take the normal database/deployment backup; record the current deploy and commit.
4. In a Zoho sandbox/test organization, enable the setting and exercise one estimate, sales order, invoice, credit note, PO/bill read, discount update, conversion, package, return, and PDF/display flow with a header between products.
5. Confirm provider request counts are unchanged, JSON retains description/order, relational products contain only financial rows, and totals match Zoho.
6. Only then enable the tenant feature in a separately approved production change window; perform read-only smoke checks first.

Rollback:

1. Disable the Zoho feature.
2. Roll back to the recorded deploy/commit; do not run data repair automatically.
3. Read-only audit JSON snapshots, relational `LineItem` counts, and financial snapshots for documents received during the window.
4. If any discrepancy exists, keep processing stopped and prepare a dry-run-only repair report for separate approval.

Conclusion: **SAFE TO ENABLE only after the sandbox activation checklist passes.** Until that external compatibility gate is completed, production activation is **NOT YET APPROVED**.
