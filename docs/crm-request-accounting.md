# Shared CRM request accounting

This change is inactive unless `ZOHO_CRM_REQUEST_ACCOUNTING=on`. Deploying the code alone does not increase scheduled processing or change the current request paths. Invalid nonempty activation values fail closed for CRM requests.

When activated, each routed CRM request reserves one slot in the existing `SystemSetting` row `crm_request_budget_v1`. A database transaction locks that row before updating counters; the provider call occurs outside the transaction. Completion records a response or uncertainty without refunding the reservation. Unresolved reservations survive process failure and are never automatically reclaimed. Redirects are rejected to avoid uncounted follow-up requests.

The initial state is observation mode, without a verified baseline. Observation records activity but does **not** enforce the allowance, cooldown, or concurrency limit. Enforcement requires an explicitly verified request baseline and expiry. There is no automatic daily reset. The configured maximum cannot exceed 50,000 requests. Requests and provider credits are different quantities; the remaining-credit header is retained as separate evidence.

## Activation gates

Before activation, verify the exact deployed commit, focused transport and PostgreSQL concurrency tests, broader affected-caller validation, and an appropriate current backup. Review database latency and attachment-buffer memory impact. The transport holds its reservation through body consumption and buffers the body before returning it.

Before enabling enforcement, establish the allowance window and baseline from complete request evidence, including historical traffic before this helper was enabled. Account for private scripts and any other applications sharing that allowance. Books, Voice, OAuth, browser operations and external integrations are outside this CRM wrapper. A local manual ledger alone cannot prove global headroom. Migrate other writers into a shared accounting boundary or explicitly allocate separate verified sub-budgets before claiming a global limit.

Set expiry, limit, maximum concurrency and a verified baseline through a reviewed, compare-and-swap administrative change. Do not overwrite pending reservations, reset counters, clear halts or extend expiry merely to restore throughput. Preserve the previous state and authorization evidence. Keep the existing scheduler cadence until a separate throughput change is reviewed.

## Failures and recovery

- Reservation database failures block the request before submission.
- Network or body-read uncertainty consumes the reservation and records a halt. An unrecorded completion remains unresolved. Never infer that an external write did not occur from a local accounting error.
- In enforcement mode, authentication failures and exhausted credit evidence halt subsequent calls; 429 responses establish a cooldown. Recovery requires investigating the provider condition and preserving existing write ambiguity holds.
- Deal package writes blocked before their single provider submission return to pending. An accepted write whose readback is blocked retains its provider ID and ambiguity state. The scheduler defers quota-blocked work without clearing business holds or marking its revision checked.
- Turning accounting off restores bypass behavior, so it is not a safe quota-protection rollback. Prefer pausing the affected traffic while investigating, retaining the accounting row and all operation evidence. Any production pause or settings change needs the applicable authorization.

This helper does not establish exactly-once provider execution, repair customer identity, or authorize retrying ambiguous writes.

## Proposed settings and impact (not activated)

The release default is `ZOHO_CRM_REQUEST_ACCOUNTING=off` (unset is equivalent). The scheduler remains five jobs per invocation every five minutes, with the existing 40-second processing window. This PR provides no throughput increase. No production setting or budget row is changed by this PR.

A separately authorized observation phase would set `ZOHO_CRM_REQUEST_ACCOUNTING=on` and retain `mode=observe`, `baselineVerified=false`, `expiresAt=null`, `limit=50000`, and `maxInFlight=1`. In observation mode that concurrency value is not enforced. Activation adds two database transactions per CRM request and buffers response bodies; measure latency and memory before proceeding.

A separately authorized enforcement phase would retain `ZOHO_CRM_REQUEST_ACCOUNTING=on`, set `mode=enforce`, `maxInFlight=1`, `baselineVerified=true`, and set `baselineRequests`, `allowanceId`, `expiresAt`, and an allocated `limit <= 50000` from independently verified allowance evidence. Those last values cannot be responsibly supplied from the manual operational ledger. Preserve all existing counters and pending reservations. Enforcement activation is blocked until that evidence and a reviewed compare-and-swap update exist.

The shared gate affects invoice packages and attachments, CRM pagination, account/contact updates, tasks and notes, lead lifecycle operations, native CRM call records, and CRM requests from AI tools. An enforcement halt can therefore defer both background work and interactive requests. Existing callers retain their own error and ambiguity handling; only invoice package operations gain the specific pre-submission deferral path in this change. Private operational scripts, other applications and provider APIs outside CRM are not covered.

Observed scheduled verification during reconciliation was 15 records in approximately 11.2 minutes (about 1.34/minute) for one selected cohort. That observation is not a benchmark of this wrapper and does not predict total queue completion. The configured scheduler ceiling remains five jobs per five minutes before runtime limits and holds; overlapping invocations or other producers must be measured separately. Expected improvement from this PR alone is zero; enforcement may reduce throughput. Faster cadence requires another reviewed change and explicit rollout authorization.

Before activation, reverting the code restores the previous implementation without deleting any evidence. After activation, disabling the flag or reverting the code bypasses accounting and must not be represented as preserving the cap. The protective rollback proposal is to pause affected CRM traffic under explicit authorization, retain the row and provider-operation evidence, investigate, and resume only after reconciliation of uncertain requests.

## Validation

The dedicated PostgreSQL suite uses `CRM_BUDGET_TEST_DATABASE_URL` and rejects non-local hosts or any database/user other than `budget_test`; it never falls back to `DATABASE_URL`. Use a disposable database because it truncates its four fixture tables. It covers concurrent first-row creation, the final allowance slots, retained crash reservations, transaction rollback, concurrent job claims, replacement leases, and revision changes. A separate full-schema disposable database is needed for affected invoice-persistence integration tests.

Local validation: 103 focused transport/CRM/PostgreSQL tests and 170 dependency-related tests passed (overlapping suites, not additive). TypeScript, the production Next.js build, all 125 Netlify function bundles after rebasing onto the current main branch, and focused lint passed. Existing files have pre-existing lint debt; compare changed-file diagnostics against the base rather than claiming repository-wide lint is clean. The repository-wide Vitest glob also includes standalone scripts and separately configured integrations, so it is not the validated test command.

The `CRM request budget validation` workflow repeats the dedicated PostgreSQL and focused tests, TypeScript, focused lint, all function bundles, production build and diff check on the PR. CI uses disposable fixture values only. No workflow deploys or activates this feature.
