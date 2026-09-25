# Sales lifecycle blocker audit

Status: follow-up reconciliation implementation in progress; not released and not production-verified.

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
- Missing product cost now blocks order selection. Numeric zero remains blocked unless its quality is explicitly `VERIFIED_ZERO`; it is never silently converted into zero-cost profit. Dropship eligibility remains nullable/unknown unless provider evidence satisfies the portal's purchase-order contract.
- Bounded alternative-product discovery chose RFD-50A060 for acceptance: active, $0.91 selling price, authoritative $0.36 purchase rate, purchase-capable non-inventory goods classification, and an exact active preferred vendor. The follow-up reconciler uses an exact bounded Books SKU lookup and a targeted preferred-vendor lookup. It persists price/cost/vendor evidence but deliberately keeps `canDropship` unknown unless Books returns an explicit dropship eligibility flag; zero stock and a vendor relationship alone are not treated as authorization.

## Follow-up acceptance blocker repair

- `/admin/lifecycle-reconciliation` and its POST-only administrator APIs reconcile an already-converted local Account/Lead pair by immutable local linkage. They use the durable CRM create/convert operations, never create another local Account, never resolve by company name alone, and never create a second Books customer.
- Existing Books customers now receive a targeted customer GET and persist the unique contact-person ID only when it matches the local primary contact by exact email or normalized phone. Ambiguous/missing matches fail closed.
- Task creation resolves the submitted local Account ID first, requires its authoritative `crmAccountId`, submits that ID as CRM `What_Id`, and persists the Task against the same local Account. Provider codes/messages remain readable instead of becoming `[object Object]`.
- RFD-50A060 product reconciliation is read-only upstream and idempotent locally. It verifies exact identity, active state, positive sales/purchase rates, purchase-capable goods type, non-inventory mode, and the exact active preferred vendor before persisting authoritative cost evidence.
- Gift selection retains the exact Books item `1254360000043727500` with $0 sales price and $20 authoritative cost; focused regression coverage remains in place.
- Production acceptance found two provider-shape mismatches: a locally converted Lead must not be created upstream with the local-only terminal `Converted` status, and Books may return an inventory account while explicitly setting `track_inventory` false. The hotfix maps only that terminal status to `New Lead` for the create-before-convert step and honors the explicit tracking boolean. Neither an inventory account nor zero stock authorizes dropship.
- A second CRM acceptance attempt still returned `INVALID_DATA`, while the token lacked field-metadata scope needed to prove custom picklists. The final create payload therefore omits unverified optional `Lead_Status`, `Industry`, and `Time_Zone` fields and lets CRM apply its configured defaults. The authoritative local values remain unchanged; they are not guessed into unsupported CRM fields.

## Still required before release

- Mocked provider concurrency, rejection, accepted-timeout, lock-expiry, and transaction-failure coverage.
- Deploy and invoke the restricted reconciliation path for local TEST account `cmug0bjgs0002z35hikn7od9w` and lead `cmufz988p00012v293aj45jas`, then verify the resulting exact CRM/Books mappings.
- Remaining fulfillment idempotency, address/shipping/tax preview, and truthful pending/ambiguous UI feedback corrections.
- Full lint, build, function bundle, preview, reviewed merge, backup, production deploy, and browser/provider acceptance.
