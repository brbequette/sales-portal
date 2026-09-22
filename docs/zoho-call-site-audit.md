# Zoho access and database-only surface audit

This audit is static and read-only. It does not contact Zoho, production, or the database.

## Findings

Zoho access is concentrated in scheduled Netlify functions and explicit API actions. The audited user-facing pages call portal APIs; the main exceptions requiring follow-up are `useDashboardData.ts` (`/api/zoho-invoices`), `DealPipeline.tsx` (`/api/zoho-invoices`), and explicit operational actions such as product updates, fulfillment, tariff updates, and bulk cost processing.

Scheduled synchronization and package functions are not page-render dependencies. They remain separate from page reads and must not be invoked by rendering or refresh.

## Contract for follow-up work

1. Local PostgreSQL is the only runtime read source for user-facing surfaces.
2. Sync, import, reconcile, approve, and outbound-package phases are explicit administrator actions.
3. A local-data error is rendered as an error/blocker; no provider fallback is allowed.
4. Existing GET-only bounded synchronization remains the only bounded importer.
5. Financial calculations continue to fail closed when local cost evidence is absent.

The machine-readable inventory is `docs/zoho-call-site-inventory.json`. It intentionally contains paths, access direction, and replacement contracts only; it contains no credentials, identifiers, customer data, or document payloads.
