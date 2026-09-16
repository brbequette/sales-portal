# Customer write-off recovery — audit, gap analysis, and Zoho manifest

## Safety and read-only evidence

The production audit ran in a serializable PostgreSQL transaction after `SET TRANSACTION READ ONLY`. It returned aggregate counts and field names only. No database row, Zoho record, write-off, credit note, ledger item, sync cursor, Full Sync, or reconciliation state was changed.

- Production contains **0** invoices marked written off and **0** `ClawbackTransaction` rows, so no legacy recovery balance is migrated.
- The current direct endpoint guessed product cost from `deadCostTotal | cost | totalCost | invoice amount × 40%`, immediately wrote the invoice and a floating-point deduction, and had no dry run, idempotency, independent approval, immutable ledger, or refund/return evidence.
- Existing return routes accept caller-supplied costs, reduce a JSON balance before inspection, mutate a single hold, and clear it on resale. They do not prove receipt, condition, historical cost, or the accepting inspector.
- Credit notes are supported as a direct Zoho write and as a bounded read collection, but there is no persistent local credit-note or refund allocation model linking a credit to write-off responsibility.
- Commission reporting derives earnings from invoices and payouts. `ClawbackTransaction` is mutable and uses floating-point dollars; it is not an immutable general commission ledger. The new ledger is append-only and separately records `COMMISSION_REVERSAL` and `COST_RESPONSIBILITY_DEBIT`.
- Stored invoice evidence includes `cf_dead_cost_total` (1,976 rows), `actualShippingCost` (1,774), `cf_credit_card_processing_fees` (1,976), gift/additional-cost fields (1,962+), shipping bills/rollups, and line-item snapshots. There are no authoritative mapped fields for accepted returns, vendor/carrier/processor refunds, actual tariff burden, collection/legal fees, waivers, or recovery-case state.
- Existing mapped Zoho invoice fields include `cf_written_off`, dead cost, VIG-inflated dead cost, card fees, insurance, additional costs, and commission. Historical product cost must come from line-item/cost snapshots, never `cf_dead_cost_with_vig`, revenue, or a percentage estimate.

## Gap closure

`WriteOffRecoveryCase` is the versioned approval aggregate. `WriteOffRecoveryCostComponent` stores evidenced costs and recoveries with unique event keys. `WriteOffReturnInspection` proves receipt, inspection, condition, historical cost, and accepted resellable cost. `WriteOffRecoveryLedgerEvent` is append-only; corrections, refunds, accepted returns, and waivers create later versions instead of editing posted entries. `WriteOffRecoveryPolicy` stores the manager-configured basis-point rate and keeps Zoho sync disabled.

Approval and dry-run calculation fail closed unless an approved, positive
`HISTORICAL_PRODUCT_COST` component cites an invoice-line, purchase-order-line,
or vendor-bill-line historical source. Catalog fallback and aggregate commission
snapshots are not authoritative approval sources.

The legacy direct write-off endpoint now fails closed. Approval requires a current dry-run hash and an independent manager who is neither creator, submitter, nor responsible salesperson. Approval retains the existing invoice `written_off`/goal-removal behavior and the commission query excludes written-off statuses. A salesperson can read only their cases and receives redacted provider evidence/actor identifiers.

Known blockers: historical product cost is available only where the invoice-line,
purchase-order-line, or vendor-bill-line snapshot is complete. A case must remain
unapproved when that evidence is absent. Commission payouts are aggregate ledger
transactions and must not be retroactively allocated to invoices. The deployed
recovery ledger is not yet included in the aggregate commission balance, so the
commission-reversal/carry-forward policy requires a separate correction before a
real recovery can be approved safely.

## Calculation contract

All inputs are non-negative integer cents. Included company costs are historical product cost, gifts, outbound freight, return freight, actual card fees, actual tariff, collection/legal fees, and approved additional costs. Insurance is included only when its component is explicitly approved. Vendor, carrier, and processor refunds and accepted returned-product historical cost reduce company cost. Sales tax, revenue, markup, unincurred estimates, VIG uplift, damaged/missing/unsellable returns, and unapproved insurance are excluded.

`responsibility = round_half_up(max(0, included costs − recoveries) × rate basis points / 10,000)`.

All write-off recovery percentage fields have the business default `50.00%`.
Zoho-facing decimal percentages are normalized at the integration boundary:
`50.00` maps to the application's integer `5000` basis points and back to
`50.00`. This rate is isolated from ordinary salesperson commission plans and
commission rates. An individual recovery may differ from the policy default
only when an authorized manager supplies an audit reason; the case stores both
the original policy rate and the override rate. No approved case rate is edited
in place.

An accepted returned product reduces responsibility only after receipt and inspection as resellable. At the default 50% rate, its ledger credit is 50% of accepted historical product cost.

## Verified Zoho Books metadata — 2026-09-16, no writes

The supported read-only Settings Fields API returned metadata successfully for
`invoice` (26 custom fields), `invoice_item` (1), `creditnote` (0),
`salesorder` (13), `contact` (9), `purchaseorder` (2), `bill` (0), and `item`
(21). The same endpoint with advanced-search filtering established which fields
are searchable. This discovery made GET requests only and emitted no credentials,
record identifiers, or customer data. The machine-readable evidence contract is
`docs/write-off-recovery-zoho-metadata-2026-09-16.json`.

| Module | Visible label | API name | Type | Limits / values | Search | Books API | Webhook | History | Exists | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Invoice | Written Off? | `cf_written_off` | Check Box | Boolean `false`/`true`; length and precision not applicable | Yes | Yes, settings and invoice custom fields | `UNVERIFIED` payload inclusion | `UNVERIFIED` | Yes, active | VERIFIED from live metadata |
| Invoice line item | `UNVERIFIED` (unrelated field) | `cf_cost_increase_completed` | Check Box | Unrelated and inactive | No | Metadata only; operational exposure not required | `UNVERIFIED` | `UNVERIFIED` | Yes, inactive | API/type/status VERIFIED; label not retained |

Zoho metadata does not report retained field-history guarantees or webhook body
membership, so neither is claimed. Five existing webhook definitions were listed
read-only: active Invoice Sync, Sales Order Sync, Estimate Sync, Vendor Sync, and
Payments webhooks. Their URLs, IDs, and payloads were not recorded.

### Minimal Zoho footprint — proposed, not applied

Reuse the existing `Written Off?` checkbox. If sandbox validation proves an
operational need, add only these two invoice fields; Zoho assigns their API names,
so the names remain `UNVERIFIED` until post-creation sandbox metadata is read.

| Module | Visible label | API name | Type | Allowed values / validation | Purpose |
|---|---|---|---|---|---|
| Invoice | Recovery Case ID | `UNVERIFIED` | Text | Exact maximum length `UNVERIFIED`; one opaque application ID | Link to the authoritative application case |
| Invoice | Recovery Status | `UNVERIFIED` | Dropdown | `BLOCKED_EVIDENCE`, `PENDING_APPROVAL`, `APPROVED`, `WAIVED`, `CLOSED`, `REVIEW_REQUIRED` | Concise operational reporting only |

All requested percentage labels—Recovery Percentage, Rep Cost Responsibility
Percentage, Commission Responsibility Percentage, Product Cost Responsibility
Percentage, and Approved Additional Cost Responsibility Percentage—remain
application-only. Their business value is `50.00%`, normalized to `5000` basis
points at the application boundary. Creating five Zoho copies would invite drift
and could be confused with ordinary commission plans.

The following also remain exclusively in the immutable application recovery
record: Written Off At, Written Off By, Write-Off Reason, Responsibility Rate,
Original Responsibility Rate, Responsibility Override Reason, Historical Cost
Status/Snapshot, Commission Reversal Status, Cost Responsibility Status, Return
Status, Accepted Return Value, Waiver Amount, Recovery Balance, Recovery Version,
and Last Recovery Calculation Hash. Zoho custom fields must not become an approval,
calculation, evidence, inspection, audit, or ledger authority.

### Trigger contract and current gap

The exact trigger is an invoice transition from `cf_written_off=false` (or absent)
to boolean `true`. A webhook is only a hint: the future handler must perform a
targeted GET of that invoice, confirm `true`, then create one local `DRAFT` case
blocked from approval while authoritative cost is missing. A bounded read pass may
query the same searchable field to recover missed events.

Use `zoho-books:invoice:{invoice-id}:cf_written_off:true` as the event idempotency
key and the existing unique invoice-case relationship as a second guard. Replays
return the existing case and never post ledger entries. A transition back to
`false` never deletes history or reverses money automatically; it records a local
review-required transition, blocks further posting, and requires a separately
approved versioned correction if anything was already posted.

Current trigger viability is **FAIL**: the Books webhook mapper recognizes
`cf_written_off`, but no webhook or bounded-sync path creates the blocked recovery
case. Webhook payload inclusion also remains unverified. This is planned missing
functionality, not a reason to enable synchronization during metadata discovery.

### Historical-cost and return evidence

| Evidence | Exact Books exposure | Authority decision |
|---|---|---|
| Invoice line | `line_item_id`, `item_id`, quantity, rate and total | Identifies sold items; sales rate is not product cost |
| Invoice custom cost | `cf_dead_cost_total`, `cf_dead_cost_no_vig`, related active amount fields | Aggregate corroboration only; not an invoice-line historical-cost source |
| Purchase order line | `line_item_id`, `item_id`, quantity and purchase rate | Candidate historical source when explicitly linked and date/quantity matched |
| Vendor bill line | `line_item_id`, `purchaseorder_item_id`, `item_id`, quantity and rate; bill/PO relationships | Candidate historical source when explicitly linked and date/quantity matched |
| Item/catalog | Current purchase-rate and custom cost fields | Fallback only; never authoritative invoice-date cost |
| Credit note | Invoice relationship plus line `item_id`, quantity and rate | Return quantity/credit relationship only; does not prove receipt, condition, or resellable acceptance |

Zoho metadata contains no verified invoice-line historical-cost field and no
return-inspection acceptance field. A real recovery therefore remains blocked
unless the application already holds an authoritative invoice-line, linked PO-line,
or linked vendor-bill-line historical snapshot.

### Safe sandbox sequence and rollback

1. Export/read the sandbox field metadata baseline; do not recreate `Written Off?`.
2. Create only Recovery Case ID and Recovery Status in sandbox, then read metadata
   again to capture Zoho-assigned API names, lengths, values, searchability, PDF,
   API, webhook, and history behavior.
3. Configure a sandbox-only workflow/webhook and prove a checkbox transition with
   a synthetic invoice. Confirm the webhook using a targeted GET and replay it.
4. Exercise false→true, duplicate true, true→false, missing-cost, and delayed
   bounded-read scenarios. Assert that only a blocked case is proposed and no
   ledger entry is posted.
5. Keep `zohoSyncEnabled=false`; separately review any writer before promotion.

Rollback is to disable the sandbox workflow/webhook and deactivate the two new
sandbox fields. Preserve application audit history and test cases; do not delete
or rewrite ledger events. Production receives no configuration until the exact
sandbox-generated API names and behavior have been reviewed.

## Dry-run examples

| Scenario | Documented costs | Recoveries/accepted cost | Charge at 50% | Result |
|---|---:|---:|---:|---|
| Full resellable return | $1,000 product | $1,000 accepted historical cost | $0 | Receipt + inspection required |
| Partial resellable return | $1,000 product | $400 accepted historical cost | $300 | $600 net company cost × 50% |
| Damaged return | $1,000 product | $0 | $500 | No automatic credit |
| Later processor refund | $1,000 approved costs | $200 recovered fee | $400 | New `REFUND_CREDIT` version; original debit unchanged |
| Full waiver | $1,000 approved costs | — | $500 then $500 credit | New `WAIVER_CREDIT`; balance $0 |
| Duplicate webhook/manual event | Any | Same idempotency key | No second entry | Existing event returned; balance unchanged |

Assumptions: approvers include MASTER_ADMIN, ADMIN/Administrator, and role strings containing Manager. Collections users may view management scope but cannot create, approve, waive, adjust, or configure recovery. The responsible salesperson is the locally resolved invoice/account salesperson selected in the case. Collection/legal and additional costs require documentary evidence and explicit component approval. No insurance is included without an approved insurance component.
