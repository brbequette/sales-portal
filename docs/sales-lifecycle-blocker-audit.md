# Sales lifecycle blocker audit

Status: implementation in progress; not released and not production-verified.

## Confirmed root causes

- Portal lead creation used a local placeholder as though it were a Zoho identifier and performed no CRM create.
- Conversion created invented account/contact identifiers, skipped locally created leads, ignored provider result status and IDs, and reported local success after provider failure.
- Unified delta sync discarded final batches smaller than 50, fetched only the first 200 records, advanced checkpoints after partial work, parsed CRM 204 as JSON, and used a non-atomic concurrency check.

## Implemented safeguards

- Durable provider operation keys make lead create and conversion idempotent.
- CRM, Books, and local identifiers have separate columns; legacy values are not guessed into them.
- Provider HTTP and per-record results are validated. Pending, syncing, successful, failed, and ambiguous outcomes are explicit.
- Timeout after submission becomes ambiguous. Lead creation performs an exact email/company lookup before retry; conversion requires reconciliation and is not automatically resent.
- Sync batches flush completely. Provider pages are bounded and resumable with a durable page pointer. The original timestamp checkpoint advances only after complete persistence; unresolved dependencies keep the current page recoverable.

## Still required before release

- Disposable PostgreSQL full-chain and production-schema upgrade rehearsal.
- Mocked provider concurrency, rejection, accepted-timeout, lock-expiry, and transaction-failure coverage.
- Idempotent Books customer/contact persistence and reconciliation of local TEST account `cmug0bjgs0002z35hikn7od9w` without creating another account.
- Product/gift/fulfillment and UI feedback corrections.
- Full lint, build, function bundle, preview, reviewed merge, backup, production deploy, and browser/provider acceptance.
