# Write-off recovery bounded trigger and Zoho API audit — 2026-09-16

## Safety and integration boundary

The trigger is integrated after the existing bounded Books collector has obtained an invoice page and before that invoice's local upsert transaction commits. It consumes `cf_written_off` from that already-returned payload. It has no HTTP client, token helper, provider URL, webhook, polling loop, or Zoho write. Recovery pages and APIs read local PostgreSQL only.

The field is optional and never coerced. Boolean observations are persisted atomically with the invoice. A missing field leaves write-off state unobserved. A malformed or ambiguous value still permits invoice persistence and appends sanitized `PARSE_ANOMALY` evidence containing identifiers, timestamps, source field, anomaly code, and fingerprint only; it creates no case and performs no provider retry.

The scheduled bounded collector remains gated by `BOUNDED_BOOKS_AUTO_SYNC_ENABLED=1` and retains its existing `*/15 * * * *` schedule and at-most-31-day range. This change does not enable it, expand the range, add a resource, add a page, or perform a backfill.

## Exact API-call delta

| Scenario | Before | After | Trigger delta |
|---|---:|---:|---:|
| One imported invoice from an already fetched page | 0 additional calls | 0 additional calls | 0 |
| N imported invoices from already fetched pages | 0 additional calls | 0 additional calls | 0 |
| Recovery page load | 0 Zoho calls | 0 Zoho calls | 0 |
| Recovery case list/detail | 0 Zoho calls | 0 Zoho calls | 0 |
| Missing cost, salesperson, or commission evidence | 0 on-demand calls | 0 on-demand calls; local blocker recorded | 0 |

The bounded collector itself still performs exactly one Books list request per returned page. It covers five existing resources (invoices, sales orders, estimates, customer payments, and credit notes), uses `per_page=200`, and stops from `page_context.has_more_page`. Minimum calls per completed run are 5. Its defensive maximum is 5,000 list calls (1,000 pages for each of five resources); the write-off trigger changes neither figure. OAuth refresh traffic is owned by the existing cached token helper and is not multiplied per imported invoice.

## Exhaustive direct-call inventory

Run `node scripts/audit-zoho-api-call-sites.mjs` to emit every current direct Zoho provider URL and access-token call site with exact file, line, invocation category, and visible pagination marker. The audited tree contains 273 direct/token call sites across 114 files:

| Category | Files | Invocation and bounding |
|---|---:|---|
| Next API routes | 32 | Authenticated page/user actions or internal API calls. Some list routes paginate; several detail/cost/shipping routes make per-record calls. |
| Netlify functions and helpers | 55 | Scheduled jobs, webhook processing, and authenticated actions. Schedules include bounded Books every 15 minutes when enabled, automation every 5 minutes, daily Books sync at 06:00 UTC, messaging every 5 minutes, and email every 3 minutes. |
| Manual/maintenance scripts | 25 | Operator initiated only. Several repair/backfill/image scripts contain per-record calls and have data-dependent worst cases. They are not invoked by this trigger. |
| Shared auth/sync helpers | 2 | Called by the routes/functions above; token refresh is cached, while sync-engine detail reads are per requested record. |

### Page-request and per-record findings

- Write-off recovery UI/API: zero Zoho calls; local PostgreSQL is authoritative.
- Dashboard, global header, commissions, and recovery reporting paths touched by this PR: zero new calls and no code changes.
- Existing page/action endpoints that deliberately call Zoho include invoice detail/PDF, customer-account refresh, vendor reads, shipping purchase-order/detail and fulfillment, product reactivation/update, and explicit Books actions such as payment, void, status, line-item, email, credit-note, discount, and conversion.
- Existing per-record/provider amplification was found in invoice-link backfill, bulk cost processing, package sync, some webhook account enrichment, account-owner/contact updates, product/image publication, repair scripts, and full reconciliation scripts. Their worst case is input-record dependent or bounded only by their own batch/page limit. These are documented findings for a separate API-conservation PR and are unchanged here.
- `sync-now` and daily Books sync paginate multiple modules; the bounded importer is separately limited to five resources, 200 rows per page, a 31-day maximum range, and 1,000 pages per resource.

## Persistence and idempotency contract

- `WriteOffRecoveryCase` retains its local invoice uniqueness and adds a unique `(triggerSourceField, triggerZohoInvoiceId)` identity.
- `WriteOffRecoveryTriggerRecord.idempotencyKey` is unique. A database trigger rejects update or delete, making transition evidence append-only.
- Initial `true` is a transition from unknown and creates a blocked case. Repeated `true` is a local no-op. Concurrent first observations converge on the same case identity and transition key.
- `true` to `false` appends evidence and sets `managerReviewRequired`, `evidenceStatus=REVIEW_REQUIRED`, and `zohoSyncStatus=REVIEW_REQUIRED`; it never deletes or reverses the case.
- Automatic cases start `DRAFT` / `PENDING_EVIDENCE`, snapshot 5000 basis points, and list missing evidence. The approval and adjustment routes reject a missing salesperson or incomplete evidence before any ledger operation.

## Sanitization

Trigger evidence stores only local and Zoho invoice identifiers, source field, previous/new Boolean, source/ingestion timestamps, missing-requirement codes, idempotency key, and a SHA-256 fingerprint over that sanitized shape. Customer names, addresses, contacts, line items, raw payloads, and credentials are not stored.
