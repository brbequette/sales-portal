# Financial persistence characterization

## Existing invoice

`process-invoice-costs.ts` fetches invoice data and calculates costs outside persistence. It calls `syncInvoicePayments(booksInvoiceId, localInvoice.id)` (remote payment fetch plus local `Payment.upsert` transaction), then calls `updateInvoiceRecord(...)`. `updateInvoiceRecord` reads `Invoice.items`, merges Zoho snapshot fields, calculated fields, and payment date, updates the `Invoice` row, then calls `syncStoredLineItems`. These are separate commit boundaries.

## Auto-created invoice

The handler resolves `Account`, performs `prisma.invoice.upsert` with identity/status/amount/date/items, calls `syncInvoicePayments`, then calls `updateInvoiceRecord`. The initial invoice upsert, payment transaction, and calculated invoice update are three separate boundaries.

## Payment synchronization

`syncInvoicePayments` performs a Zoho payments GET, computes total paid and latest date, and upserts each `Payment` by `zohoId` in a Prisma batch transaction. No payment rows yields zero totals and no local write. Fetch failure throws before any local payment write.

## Financial reviews

`financial-review-service.ts` performs standalone `FinancialReview.upsert` and `updateMany` operations. The composite `(documentType, documentRef, reasonCode)` unique key provides replay idempotency. Review writes are not currently coupled to invoice writes.

## Bulk, daily, webhook

Bulk and daily synchronization call the invoice processing/cost paths or shared sync helpers; webhook invoice handling invokes the same cost processor. Payment and invoice writes remain independently committed wherever those helpers are called.

## Refactor plan

1. `fetchInvoicePayments(zohoId): Promise<RawPayment[]>` — network only.
2. `buildPaymentSummary(rawPayments): PaymentSummary` — pure calculation.
3. `buildInvoicePersistencePlan(existing, source, calc, summary, reviews): InvoicePersistencePlan` — pure mapping.
4. `applyInvoicePersistencePlan(tx, plan): Promise<void>` — invoice, line items, payment summary, review upserts/resolutions in one transaction.

## Payment planning seam (characterization phase)

- `fetchInvoicePaymentsFromZoho(zohoInvoiceId): Promise<ZohoPayment[]>` performs only the Zoho HTTP request and throws on missing token or non-2xx responses.
- `buildPaymentPersistencePlan(payments, invoiceDbId): PaymentPersistencePlan` is pure. It emits replay-safe `sourcePaymentId` values, Payment create/update mappings, and the existing total-paid/count/latest-date summary. No Prisma writes occur in either function.
- `syncInvoicePayments(...)` remains the compatibility persistence wrapper until the atomic applier is wired; its characterized behavior is unchanged.

## Slice 1 atomic applier

`InvoicePersistencePlan` contains only validated Prisma create/update data, line-item input, payment upsert plans, payment-summary fields embedded in the invoice update, and review upsert/resolution actions. `applyInvoicePersistencePlan(plan, db = prisma)` opens one interactive transaction and delegates to the transaction-only `applyInvoicePersistencePlanInTransaction(tx, plan)`, which applies the invoice, line items, payments, and reviews without network calls or calculations.

External Zoho calls remain outside the transaction. `updateInvoiceRecord` should become a plan builder plus transaction-aware applicator; `syncInvoicePayments` should be split into fetch/summary and local payment persistence.

## Internal merge and line-item plans

- `InvoiceJsonMergePlan` carries immutable incoming patch instructions; each transaction attempt must reread current invoice JSON before applying the legacy merge strategy.
- `mergeInvoiceJson(existingJson, mergePlan)` is pure and preserves explicit nulls while skipping undefined patch values.
- `StoredLineItemPersistencePlan` carries the target invoice, replacement intent, and fully mapped `LineItemCreateManyInput` rows. Its builder is pure and preserves source ordering and identifiers.

## Complete plan-builder parity inventory

`buildCompleteInvoicePersistencePlan(input)` is a pure mechanical adapter. It does not call Prisma or Zoho and retains the caller-provided values by reference without mutation. The discriminant is `input.mode`: `existing` produces `update-existing` with an explicit local invoice id; `create` produces `create-or-update` with the create/upsert data and account relation supplied by the legacy auto-create branch.

| Legacy source expression | Plan input | Final Prisma field | Mode |
|---|---|---|---|
| `zohoDoc.status` / `mappedStatus` | `updateData.status` / `createData.status` | `Invoice.status` | both |
| parsed `sub_total` | `updateData.amount` / `createData.amount` | `Invoice.amount` | both |
| `date` conversion | `updateData.issueDate` / `createData.issueDate` | `Invoice.issueDate` | both |
| `due_date` conversion/null | `updateData.dueDate` / `createData.dueDate` | `Invoice.dueDate` | both |
| `last_modified_time` | `updateData.zohoModifiedTime` / `createData.zohoModifiedTime` | `Invoice.zohoModifiedTime` | both |
| calculated cost/profit/VIG/commission fields | `updateData` | corresponding denormalized `Invoice` fields | existing |
| conflict detection result | `updateData.syncConflict`, `updateData.conflictFields` | `Invoice.syncConflict`, `Invoice.conflictFields` | existing |
| sync timestamps | `updateData.lastSyncedAt`, `updateData.appModifiedAt` | `Invoice.lastSyncedAt`, `Invoice.appModifiedAt` | existing |
| Zoho sync flags | `updateData.lastZohoModifiedTime`, `updateData.pendingZohoFetch` | `Invoice.lastZohoModifiedTime`, `Invoice.pendingZohoFetch` | existing |
| shipping calculation | `updateData.actualShippingCost`, `updateData.shippingCostBreakdown` | corresponding `Invoice` fields | existing |
| commission split | `updateData.computedUpfront`, `updateData.computedFinal` | corresponding `Invoice` fields | existing |
| computed identity | `updateData.computedSalesperson`, `updateData.computedInvoiceNumber` | corresponding `Invoice` fields | existing |
| payment totals/date/balance | `updateData` and `payments.summary` | `Invoice.paymentMade`, `paymentExpected`, `lastPaymentDate`, `balance` | both |
| merged legacy JSON snapshot | `updateData.items` (or future `InvoiceJsonMergePlan`) | `Invoice.items` | both |
| initial account relation | `createData.account` | `Invoice.account` relation | create |
| Zoho invoice identity | `zohoId` / `createData.zohoId` | `Invoice.zohoId` | create |
| mapped stored line items | `lineItems` / `StoredLineItemPersistencePlan` | `LineItem` replacement rows | both |
| review actions | `reviewUpserts`, `reviewResolutions` | `FinancialReview` upsert/updateMany | both |

The builder intentionally does not invent fields absent from the legacy branch. Zero, `false`, `null`, and `undefined` remain distinguishable in the supplied Prisma input objects; JSON merge behavior remains delegated to `mergeInvoiceJson`.

## Phase 2B handler routing

`process-invoice-costs.ts` now performs Zoho retrieval, cost calculation, payment normalization, and review-action construction before persistence. Both the existing-invoice and auto-created-invoice branches construct one `InvoicePersistencePlan` and invoke `applyInvoicePersistencePlan` once. The former standalone payment sync, invoice update, review writes, and preliminary auto-create upsert are no longer used on these paths.

The current source audit identifies an exception: `daily-books-sync.ts` and `zoho-books-webhook.ts` import the shared `process-invoice-costs` handler, while `bulk-process-costs.ts` retains its own page-processing implementation and does not call the routed handler. Bulk remains a documented bypass requiring a later routing decision; it was not silently treated as converged.

## Conservative lifecycle safeguards

`update-payout.ts` and `delete-payout.ts` authenticate administrators and then return HTTP 409 with code `PAYOUT_MUTATION_REQUIRES_LEDGER`. `add-payout.ts` remains unchanged. The current `Payout` model has no paid/finalized status, payout-period identity, immutable ledger entry, or commission linkage, so mutation cannot be safely distinguished from paid-result mutation without an approved schema/ledger design.

`zoho-credit-note.ts` and `easyship-return.ts` retain their existing behavior. They do not automatically alter commission, do not automatically alter paid payouts, and do not perform automatic tariff reversal. Manager reconciliation remains required. No stable local lifecycle reference was introduced for refunds, credit notes, returns, or write-offs. No dedicated commission-finalization endpoint was found; none was invented.
