# Sales lifecycle blocker audit

Status: authoritative mapping and task acceptance released and production-verified; communication, financial-document, payment, and fulfillment acceptance remain gated.

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
- CRM diagnostics identified the remaining rejected nested field as `id`, originating from the legacy `User.zohoId` submitted as `Owner.id`. Because that value is not an authoritative CRM Users mapping, the create payload now also omits `Owner`; local ownership remains unchanged and CRM applies its configured default until a dedicated CRM-user mapping exists. The payload continues to omit unverified optional `Lead_Status`, `Industry`, and `Time_Zone` fields.

## Remaining acceptance gates

- Provider-response tests reject HTTP errors, per-record errors, malformed bodies, and missing IDs. Durable create/convert paths preserve explicit syncing, failed, and ambiguous outcomes; broader end-to-end concurrency and transaction-interruption simulation remains a follow-up where not already covered by focused unit contracts.
- The restricted reconciliation path was deployed and invoked for local TEST Account `cmug0bjgs0002z35hikn7od9w` and Lead `cmufz988p00012v293aj45jas`. CRM Lead/Account/Contact and Books Customer/Contact mappings all verify as authoritative 19-digit identifiers. Exactly one CRM-backed Task was created against the same local Account.
- Production preflight confirms the approved contact controls and address, zero prior financial-document spend, and authoritative RFD-50A060 price/cost/vendor evidence. Dropship remains blocked because no explicit provider eligibility flag exists; zero stock and vendor presence are deliberately insufficient.
- Financial-document, payment, reminder, campaign, purchase-order, package/shipment, and label acceptance are NOT RUN. They require the promised just-in-time user confirmation and, for the dropship path, authoritative eligibility evidence. No communication or financial transaction was sent during mapping/task acceptance.
- PR #103 and PR #104 passed lifecycle/migration CI and Netlify previews before merge. Production main is `9a65046417d4131aec67fc6063034fe872d84c4b`; Netlify deploy `6ab602ed6c36160008c4be1e` is ready and the production root returns HTTP 200.
