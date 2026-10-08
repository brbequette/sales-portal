# Invoice returns to Scottsdale

The Collections return action supports one domestic US package per saved return request. Several requests can cover separate boxes, but the same invoice quantity cannot be reserved twice.

## Office workflow

1. Open the invoice's Return action. Confirm the client's actual sender address and contact information. All destinations are Titan Diamond USA, 8321 E Evans Road, Suite 104, Scottsdale, AZ 85260, including dropship orders.
2. Select the invoice lines and quantities being returned. Free promotional lines remain separate from paid merchandise. Enter measured length, width and height in inches and total packed weight in pounds.
3. Enter the reason and choose whether Titan pays return freight or proposes deducting it from customer credit. This is a per-return decision.
4. Review the quoted service and total, then explicitly buy the selected label. Quotes expire after 15 minutes. Neither quotes nor labels reduce the invoice balance.
5. Print a confirmed label and track the existing shipment. Pending or uncertain results stay saved; refresh the existing shipment rather than creating another label.
6. After delivery to the office, a collections manager records accepted quantities and inspection notes. The proposed merchandise credit is before tax and final accounting adjustments. Accepted-item purchase cost is a cost basis only, not proof of inventory recovery.
7. Create and apply the credit in Zoho Books, reviewing taxes, discounts, customer freight deductions and the original outbound freight policy. In the return record, enter the posted credit-note ID and the amount applied for this return. Verification checks the customer, currency, invoice allocation and actual amount, and records the current Books balance. A zero-credit inspected return can instead be closed without a credit.

## Accounting boundaries

Return freight is stored in the invoice-linked InvoiceReturn ledger. It does not overwrite actualShippingCost or outbound shipping allocations. Refreshing the existing shipment updates its known carrier cost; later carrier adjustments still require review. A missing provider charge remains unknown, not zero. The purchased courier is matched explicitly when Easyship supplies an array of alternative rates.

This release does not automatically create or apply Books credits, restock inventory, generate supplier credits, issue cash refunds, adjust commissions, impose a rep hold, or change profit rollups. Those actions require the established accounting/inventory process. The form shows proposed credit separately from verified applied credit; Collections' balance is updated by normal authoritative Books synchronization. A paid-in-full invoice requiring a cash refund needs the Books refund workflow rather than an applied-credit verification.

## Recovery

The saved RMA UUID is sent as Easyship platform_order_number. Shipment creation and label purchase have separate idempotency keys. A database claim occurs before the first external write, so repeated clicks, concurrent requests and lost responses cannot automatically purchase again. Easyship idempotency keys expire; the local purchase claim is retained indefinitely.

After an uncertain response, use the saved shipment ID or search Easyship for RMA-<UUID>. Never start a replacement purchase until Shipping confirms the first outcome. A changed price stops before the label request and keeps the draft shipment ID for review in Easyship. Manual cancellation or voiding of a purchased/uncertain shipment and releasing its reserved quantity is not implemented in this release; escalate to Shipping rather than deleting the return ledger entry. Only unpurchased quotes can be cancelled in the form.

## Deployment and validation

Apply prisma/migrations/20261008193000_invoice_returns/migration.sql through the normal production migration gate before exposing the new API. The migration only adds a table, indexes and an Invoice foreign key; it changes no existing invoice rows. It enforces unique shipment and credit-note identities and nonnegative monetary values.

Both the Next route and direct Netlify function use the same authenticated service. Owners can quote/purchase their accounts' returns; collections managers can inspect and reconcile credits. VIEWER cannot mutate returns. External provider writes must never be used for smoke tests without an actual approved return and label price.
