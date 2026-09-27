# Targeted invoice metadata refresh

`POST /api/admin/invoices/refresh-metadata` requires an administrator session with a local user ID. Supply one exact `booksInvoiceId` and the invoice's `expectedUpdatedAt` ISO revision. It does not accept a date override, actor override, batch, customer identity, or financial values.

The route requires a current verified package with exact invoice salesperson evidence, matching account, no active lease, no invoice conflict/pending fetch, and no unresolved provider operation. It uses an existing valid Books token and makes one bounded invoice GET, without OAuth refresh, provider writes, or retries. Operators must reserve this request in their provider allowance before invocation; the operational action and event record its one-call reservation and result. A failed or running revision claim requires review and cannot be automatically retried.

The fixed invoice merge supplies issue/due dates. The guarded write changes only those columns and cached date/link metadata. Financial, payment, cost, profit, commission, ownership, status, line items, and full-sync watermarks remain untouched. Customer and potential mismatches reject the operation. A serializable transaction compares the entire captured invoice/account/deal/job snapshot, verifies the exact update, and saves before-evidence. The existing invoice trigger queues the changed revision. A separate post-commit read verifies the saved invoice. Replaying a successful revision verifies the saved result without another provider request.

This path does not replace a full Books sync or resolve business holds. A deployment alone does not refresh existing records. Independently confirm the date and subsequent package revision before continuing any association repair.
