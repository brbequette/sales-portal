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

## Proposed Zoho configuration manifest — not applied

Zoho synchronization remains disabled (`zohoSyncEnabled=false`). This manifest must receive a separate review, then be created in a Zoho sandbox/test organization before any production configuration. No sandbox metadata credentials were available during implementation. Every API name below is therefore `UNVERIFIED`; no production field may be created and no synchronization may be enabled until the sandbox metadata API returns the actual names.

| Module | Label | API name | Type | Default / validation |
|---|---|---|---|---|
| Write-off recovery | Recovery Percentage | `UNVERIFIED` | Percentage, 2 decimals | `50.00`; 0.00–100.00 |
| Write-off recovery | Rep Cost Responsibility Percentage | `UNVERIFIED` | Percentage, 2 decimals | `50.00`; 0.00–100.00 |
| Write-off recovery | Commission Responsibility Percentage | `UNVERIFIED` | Percentage, 2 decimals | `50.00`; 0.00–100.00 |
| Write-off recovery | Product Cost Responsibility Percentage | `UNVERIFIED` | Percentage, 2 decimals | `50.00`; 0.00–100.00 |
| Write-off recovery | Approved Additional Cost Responsibility Percentage | `UNVERIFIED` | Percentage, 2 decimals | `50.00`; 0.00–100.00 |

These labels are the requested business labels, not confirmed Zoho API names.

| Module | Label | Unverified proposed API name | Type | Allowed values / validation |
|---|---|---|---|---|
| Invoice | Recovery Case ID | `UNVERIFIED` | Text, 100 | Immutable local case ID; blank or one ID |
| Invoice | Recovery Status | `UNVERIFIED` | Dropdown | `NONE`, `PENDING_APPROVAL`, `APPROVED`, `WAIVED`, `CLOSED`; forward-only except versioned correction |
| Invoice | Recovery Charge | `UNVERIFIED` | Amount, 2 decimals | ≥ 0; mirrors approved cents only |
| Invoice | Recovery Balance | `UNVERIFIED` | Amount, 2 decimals | ≥ 0; mirrors latest ledger balance |
| Invoice | Recovery Version | `UNVERIFIED` | Integer | ≥ 1; must increase |
| Invoice | Recovery Last Event | `UNVERIFIED` | Date-time | UTC posted timestamp |
| Custom Module: Write-Off Recovery Cases | Case ID | `UNVERIFIED` | Auto/Text | Unique, immutable |
| Custom Module | Invoice ID | `UNVERIFIED` | Lookup/Text | Required; unique active case per invoice |
| Custom Module | Responsible Salesperson ID | `UNVERIFIED` | Lookup/Text | Required local/Zoho user mapping |
| Custom Module | Status | `UNVERIFIED` | Dropdown | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `WAIVED`, `CLOSED` |
| Custom Module | Version | `UNVERIFIED` | Integer | ≥ 1; monotonic |
| Custom Module | Responsibility Percentage | `UNVERIFIED` | Percentage, 2 decimals | 0.00–100.00; snapshot, default `50.00` |
| Custom Module | Original Cost | `UNVERIFIED` | Currency | ≥ 0; included documented costs only |
| Custom Module | Recoveries | `UNVERIFIED` | Currency | ≥ 0; documented refunds/accepted cost |
| Custom Module | Responsibility Charge | `UNVERIFIED` | Currency | Formula snapshot; ≥ 0 |
| Custom Module | Credits | `UNVERIFIED` | Currency | ≥ 0; posted credits only |
| Custom Module | Remaining Balance | `UNVERIFIED` | Currency | ≥ 0; latest immutable ledger balance |
| Custom Module | Dry Run Hash | `UNVERIFIED` | Text, 64 | Lowercase SHA-256; required before approval |
| Custom Module | Approval Actor ID | `UNVERIFIED` | Text | Required for approved/waived; cannot equal creator/subject |
| Custom Module | Approval Timestamp | `UNVERIFIED` | Date-time | Required for approved/waived |
| Custom Module | Reason | `UNVERIFIED` | Multi-line | Required; 10–2000 characters |
| Custom Module | Zoho Sync Status | `UNVERIFIED` | Dropdown | `DISABLED`, `REVIEW_REQUIRED`, `APPROVED`, `SYNCED`, `ERROR`; default `DISABLED` |

Detailed cost components, inspection evidence, idempotency keys, actor metadata, and immutable ledger events remain local because syncing them to invoice custom fields would expose sensitive evidence and exceed a safe denormalized contract.

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
