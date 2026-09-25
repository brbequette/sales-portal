# Invoice-backed deal packages

## Scope and ownership

The implementation is currently **unreleased and disabled by default**. No live invoice, deal, account, stage, CRM field, or attachment has been changed by this task.

Each invoice is reconciled to an existing same-account deal using its saved relationship, an exact linked quote/order identity, or a unique exact document-reference suffix. Missing deals receive a stable local `invoice:<Books ID>` identity until CRM creation is verified. This placeholder must never be sent as a CRM record ID. Existing pre-invoice opportunities and historical records are retained.

Books/local invoice evidence owns post-invoice disposition, amount, balance, payment and calculated-financial data. CRM retains its native custom fields, unmarked description text, and notes. CRM names and notes are read back into the portal. Owner/account disagreements are exceptions rather than silent reassignment. Stage mapping is explicit: portal financial dispositions map to the organization’s real CRM stages.

The portal’s `/deals/[id]` package contains account/contacts, quotes, orders, invoices/lines/payments/calculation fields, purchase orders, packages/tracking, tasks, closeout evidence, operational history, account notes/calls/transcripts/messages, and native CRM notes/fields. Account-wide activities are explicitly labeled as context, not asserted to belong to the deal. Binary media remains at its existing referenced source. There is no claim that missing source data is complete.

Zoho receives a managed description summary, a link to the authenticated live package, and an immutable JSON attachment for each changed package version. Attachments are identified by a content hash and downloaded to verify content. Existing attachments are retained. Native CRM fields are available on the deal itself and in the live portal package; they are excluded from the attachment hash to avoid a self-referential update loop.

## Lifecycle and safety

- Draft, invoiced, partial, overdue, paid, void, written-off, credited/refunded, settlement-review and unknown/conflict dispositions are distinct.
- Zero balance alone does not prove payment. Missing balance/costs remain unknown.
- `Complete` requires paid invoices, linked delivered packages, and completed checklists with verified payment, gift and satisfaction evidence. Manual checkmarks or shipped-only packages are insufficient.
- `DealSyncJob` is durable. Database triggers enqueue invoice/payment/document/package/checklist changes regardless of which importer wrote them. Daily eligible refreshes also cover overdue aging and account context; actual refresh latency depends on queue size and provider throughput.
- Claims use `FOR UPDATE SKIP LOCKED`, bounded leases and revision checks. Source changes during processing remain queued. Reconciliation uses serializable transactions and account-level advisory locks.
- CRM writes use the existing `ProviderWriteOperation` audit with atomic claims. Unknown outcomes are reconciled by reads; creates/attachments are never blindly reissued. Record updates use `If-Unmodified-Since` and field readback.
- CRM workflow triggers and cadences are suppressed. Invoice-managed deals are excluded from the legacy outbound deal automation engine. Rebuilding history must not send customer communications.
- Bulk imports retain existing deal links and resolve legacy references only within an exact account; duplicate references are not resolved by row order.

## Activation prerequisites

1. Apply migration `20260925180000_invoice_deal_sync_queue` with the release. It only installs/seeds a queue and does not modify deals or call Zoho.
2. Reauthorize the core Zoho grant to permit `ZohoCRM.settings.fields.READ`, alongside the existing required Deals/Notes/Attachments read/write scopes. The live metadata request returned HTTP 401 `OAUTH_SCOPE_MISMATCH`; deal enumeration succeeded.
3. Verify or create a unique text field on CRM Deals (suggested API name `Portal_Deal_ID`). Validate its actual API name, uniqueness, permissions, any pipeline/layout mandatory fields, and allowed stage mapping. Field creation requires a suitable administrator grant/UI; this implementation does not silently change CRM schema.
4. Reconcile missing authoritative `Account.crmAccountId` values using provider ID evidence. Do not populate them from company-name matches or assume every existing association is correct.
5. Resolve cross-account and owner conflicts, preview a bounded canary, take a fresh verified production backup, then enable through `/admin/deal-sync`. The admin page provides coverage and exceptions and can run the next bounded batch. Configuration changes are audited.
6. Complete the full backfill with coverage/readback evidence and zero unresolved exceptions before calling the two systems synchronized. At default batch size five per five-minute run, a full historical rebuild takes multiple days; use a supervised bounded runner or increase measured throughput only after canary acceptance.

## Read-only production audit — 2026-09-25

Saved private evidence is under the original workspace `.codex-tmp/deal-sync/`; never commit it.

- Exact record counts and stage populations are retained only in private local evidence. The audit found missing invoice links, cross-account links, owner disagreements and missing explicit CRM Account mappings. Relationship evidence alone does not certify customer identity.
- No source record was changed. The earlier environment-file question is resolved: the existing authorized `.env` file works when database network access is granted; Netlify's secret-value API is masked.

## Validation

All 34 focused lifecycle/identity/retry/preservation tests pass. TypeScript, the final rebased webpack production build (373 static pages), affected Netlify function bundles, and Prisma schema validation pass. The complete 27-migration chain and `scripts/test-deal-sync-triggers.sql` passed in an isolated PostgreSQL 17 container, which was then removed. The SQL tests verify insert coverage, payment update/deletion invalidation, moved-payment invalidation on both invoices, and queue uniqueness. Production migration, browser/provider acceptance, scope repair, and full reconciliation remain release gates.

Provider references: [CRM field metadata](https://www.zoho.com/crm/developer/docs/api/v8/field-meta.html), [record creation](https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html), [guarded updates](https://www.zoho.com/crm/developer/docs/api/v8/update-records.html), [attachments](https://www.zoho.com/crm/developer/docs/api/v8/upload-attachment.html).
