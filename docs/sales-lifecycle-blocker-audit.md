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
- GitHub CI uses an isolated PostgreSQL 16 service to apply the full migration chain twice and rehearse an upgrade from the preceding schema. The first PR #95 run passed both database gates.
- Books customer creation now has one durable operation per local Account. It persists the returned Books customer ID, reconciles by exact stored CRM Account linkage, never matches by company name alone, and does not automatically resend an ambiguous POST.
- Order submission retains Books catalog item IDs. The authoritative gift hat (`1254360000043727500`) is selectable even when its local gift flag is stale, while administrative lines are excluded from merchandise and gift choices.
- Quote and sales-order POSTs use a caller-stable request UUID and an atomic durable operation claim. Provider acceptance is recorded before local persistence; an interruption in that window becomes ambiguous and ordinary retries cannot create another Books document.
- Read-only production evidence: DADGR458S is active and priced at $0.45, but Books reports a $0 purchase rate and no authoritative dropship flag, so cost/dropship acceptance remains blocked rather than guessed. Hat item `1254360000043727500` is active with a $0 sales rate, $20 purchase rate, and inventory tracking. The additive migration stores Books item IDs, purchase cost, and dropship eligibility explicitly, and the verified hat remains selectable if a bounded catalog response omits it.

## Still required before release

- Mocked provider concurrency, rejection, accepted-timeout, lock-expiry, and transaction-failure coverage.
- Read-only reconciliation of local TEST account `cmug0bjgs0002z35hikn7od9w` against its exact CRM/Books mappings without creating another account.
- Remaining fulfillment idempotency, address/shipping/tax preview, and truthful pending/ambiguous UI feedback corrections.
- Full lint, build, function bundle, preview, reviewed merge, backup, production deploy, and browser/provider acceptance.
