# Audited purchase-order to sales-order links

A Books purchase order can reference a sales-order number while omitting `salesorder_id`. The nullable `PurchaseOrder.salesOrderLinkEvidence` column records independently corroborated local associations without repurposing line items or changing provider financial documents.

`linkCorroboratedPurchaseOrder` is an internal reconciliation utility, not an HTTP endpoint or an automatic fuzzy matcher. Its caller must supply authenticated provider readbacks and their actual observation time. It requires an exact unique local order reference, matching complete delivery/shipping addresses and company identities, item identity with matching positive quantity, and no contradictory provider IDs. A serializable transaction checks the reviewed PO version, records provenance and an operational event, and reads back the association. Identical evidence is idempotent. It never changes account ownership, invoice links, amounts, or provider records.

The database trigger covers every existing import/upsert path. For an audited inferred link, an omitted provider ID preserves the link, number, and evidence. An agreeing provider ID is accepted. A conflicting ID or number, or evidence removal/change, raises a constraint error and leaves the original record intact for review. Unaudited records retain existing provider-authoritative behavior. Resolving a held conflict requires a separately reviewed migration/workflow; this release provides no force-reassignment endpoint.

## Release gates

1. Pass focused tests, TypeScript, build, the complete migration-chain CI, and the disposable PostgreSQL trigger test.
2. Review the application PR and verify a fresh production backup and migration rehearsal.
3. Apply the additive migration before deploying the generated Prisma client. Do not apply it implicitly during a build.
4. Prove current OAuth access and complete/revalidate the candidate evidence before any production association. Prepare exact before-images and use expected record versions.
5. Independently read back each local link and the affected invoice/deal queue. A successful association is not proof of complete CRM package synchronization.

Run `node scripts/test-po-order-link-migration.mjs` to exercise the actual migration with synthetic data in a disposable PostgreSQL container with networking disabled. On Windows it uses the configured Ubuntu WSL Docker runtime. The fixture transaction rolls back. No production URL or credentials are used.
