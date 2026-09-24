# Database-only runtime read migration

This change is static/runtime code work only. It made no production request, Zoho request, OAuth refresh, import, reconciliation, mutation, deployment, or canary-data change.

## Runtime corrections

- Page-facing dashboard, pipeline, processing, account/customer, document, commission, Rep Stats, collection, task, shipping, catalog, search, PDF, product-image, and write-off health reads are PostgreSQL-only.
- Page readers use `/api/database-documents`; legacy `/api/zoho-invoices` remains a PostgreSQL-only compatibility alias.
- Missing document detail, PDF, purchase-order detail, and product-image evidence returns `LOCAL_DATA_INCOMPLETE`; no provider fallback runs.
- Refreshes re-query PostgreSQL. Catalog/account imports are explicit administrator POST actions.
- Customer account GET reads local `Account`, `Contact`, and owner rows. Its CRM update moved to `POST /api/customer/account/update`.
- Shipping GET and drill-down dependencies are local. The explicit Books sales-order refresh moved to `POST /api/shipping/action` and is no longer triggered by expanding a row.
- Document rendering no longer launches cost processing. Cost processing remains an explicit action.
- Financial/pipeline/catalog state is cleared on failed refresh so stale values are not presented as current.

## Freshness and measurement contract

`database-read-metadata.ts` performs one bounded SQL statement and reports:

- `source: POSTGRESQL`
- last successful bounded import
- active run start and heartbeat
- last failure with a fixed sanitized reason category
- stale flag and fixed stale reason

Instrumented reads emit `Server-Timing`, `X-DB-Query-Count`, `X-Data-Source`, `X-Zoho-Calls: 0`, and `X-OAuth-Refreshes: 0`. Timing was not fabricated: the verified base emitted no server timing, and this task was prohibited from production/deployment access. Corrected runtime duration is therefore captured per response after deployment rather than claimed from an unrepresentative build process.

## Before/after bounded performance inventory

| Surface | Before | After |
|---|---|---|
| Dashboard/header client requests | 3 concurrent requests (two duplicate summary requests plus Rep Stats) | 2 requests; concurrent summary reads deduplicated without retaining a cache |
| Dashboard summary DB queries | 3 | 4, including the single shared freshness query |
| Dashboard Zoho/OAuth | 0 / 0 | 0 / 0 |
| Account refresh | Up to 10,000 rows and an unbounded CRM/Books sync loop from GET | Maximum 500 rows, PostgreSQL only |
| Account refresh Zoho/OAuth | `1 + CRM/Books pagination/detail loops` / up to 1 | 0 / 0 |
| Document list payload bound | Up to 10,000 transformed rows | Maximum 200 rows |
| Document detail | Local hit, otherwise search plus provider detail; refresh forced provider | Local queries only; incomplete evidence is HTTP 409 |
| Document detail Zoho/OAuth | Up to 2 / up to 2 | 0 / 0 |
| Document PDF | ID search plus as many as 3 provider PDF attempts | Local ownership/evidence check; incomplete evidence is HTTP 409 |
| Document PDF Zoho/OAuth | Up to 5 / up to 2 | 0 / 0 |
| Shipping row expansion | 1 sales-order read plus package/PO detail reads | PostgreSQL row/package/PO reads only |
| Shipping drill-down Zoho/OAuth | `1 + package count + missing PO count` / at least 1 | 0 / 0 |
| Catalog page refresh | Provider pages could run through `GET ?reseed=true` | One bounded local catalog GET (maximum 2,000 rows) |
| Catalog page refresh Zoho/OAuth | 1 per 200-item provider page / 1 per request | 0 / 0 |
| Commission JSON transforms | Two unnecessary async-map/`Promise.all` passes | Synchronous single passes |

Payload byte size is response-data dependent. The enforced row bounds above replace the former unbounded/10,000-row cases; exact bytes and server duration are exposed by the response/browser after deployment. No production sample was taken under this task's restrictions.

## Remaining explicit Zoho actions

These are mutation/import boundaries and are not called by page rendering or GET refreshes:

- `POST /api/sync-now`
- `POST /api/admin/bounded-books-import`
- `POST /api/admin/products/sync` and `/api/admin/products/import`
- `POST /api/customer/account/update`
- `POST /api/shipping/action` (`syncSalesOrder` only when deliberately selected)
- `POST /api/bulk-calculate-costs`, `/api/batch-tariff-update`, `/api/admin/books/bulk-process-costs`, and `/api/admin/recalculate-missing-costs`
- `POST /api/sync-costs-to-zoho` and `/api/sync-vig-to-zoho`
- `POST /api/update-product` and `/api/reactivate-product`
- explicit document actions: `/api/zoho-apply-discount`, `/api/zoho-convert`, `/api/zoho-credit-note`, `/api/zoho-email-invoice`, `/api/zoho-fulfillment`, `/api/zoho-payment`, `/api/zoho-send-document`, `/api/zoho-update-line-items`, `/api/zoho-update-status`, and `/api/zoho-void`
- explicit communication actions: `/api/zoho-voice`, `/api/sync-zoho-sms`, `/api/admin/communications/sync-voice`, and `/api/auth/magic-link`
- explicit administrative imports/repairs: Books package sync, conflict Apply, payment backfill, draft processing, overdue repair, invoice-link backfill, vendor writes, flyer publication, and lead conversion

## Exceptions

- NextAuth's Zoho authorization configuration remains reachable for sign-in/session configuration; ordinary GET session verification does not call the application Zoho token helper or refresh application data.
- Existing scheduled/webhook importers remain provider readers by design and are not page-request dependencies.
- A PostgreSQL-only read cannot synthesize missing PDF bytes or provider-hosted product images; those reads now fail closed with `LOCAL_DATA_INCOMPLETE`.
- The full Sync Center is intentionally outside this change.
