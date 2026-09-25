# Titan Diamond — Consolidated Project Context

## Shared-deal identity boundary (2026-09-25)

- Reconciliation checks Books customer identity on every invoice in a shared deal, and the CRM write boundary independently rejects conflicting packages. This prevents an otherwise valid sibling invoice from publishing another customer's data. The guarded CRM canary and replay passed; full historical activation still requires production publication and queue acceptance.
- The exact Books invoice-potential-CRM deal-account crosswalk was refreshed and applied with one-to-one identity, account-version guards, private before-images and independent readback. No company-name inference, provider account mutation, or owner reassignment occurred. Detailed counts remain private in the original workspace.

## Books customer identity guard (2026-09-25 follow-up)

- Follow-up acceptance supersedes the earlier OAuth blocker: the repaired shared token successfully reads Deals metadata. CRM now has a verified unique `Portal_Deal_ID` field. An exact-account/exact-owner existing-deal canary wrote and downloaded its complete JSON package successfully; bulk activation is still pending final deployment and queue acceptance. Native notes require the CRM v8 `fields` parameter, and new deals must populate the observed required `Invoiced_Items` field (2,000-character index with full contents in the package).
- The guard validates Zoho's explicit `unique.case_sensitive` metadata (ordinary fields return `{}`). A public `TELEGRAM_PUBLIC_ORIGIN` false positive blocked intervening Netlify builds; the coordinated scoped exclusion from PR #129 is included here, preserving scanning for all actual credentials. Full local build passes with 379 pages; focused identity/lifecycle/provider checks pass.
- The consolidated application release is published as production deploy `6ab6a488f973dd00083360e1`, commit `4a45432da531df396a76ffb7bebf51bfe91d7869`. Live administrator and complete-package pages were verified. The migration has seeded every invoice; CRM writes remain disabled pending consent/configuration.
- Document snapshots now also retain Books `customer_id`. Reconciliation rejects a mismatch against the account's explicit or legacy Books ID before any deal write, and package views show `Needs Review` instead of normal financial completion for conflicting identities. This guard prevents enabling CRM synchronization from silently accepting known source-account disagreements.
- A supervised local missing-deal rebuild and exact CRM `Books_Contact_ID` mapping pass were independently read back. Unresolved document-lineage, missing-provider and orphan cases remain explicit exceptions. Private before-images and detailed receipts are retained in the original workspace; no provider deal or financial document was created by these passes.
## Retell production acceptance and runtime credential cache (2026-09-25)

- PRs #122 and #124 are merged. Production deploy `6ab6a488f973dd00083360e1` published combined source `4a45432da531df396a76ffb7bebf51bfe91d7869`; Netlify completed at 16:50:11 UTC. All 42 focused voice/CRM tests passed against the combined source; final PR CI and preview passed.
- Exact-call Retell authentication/import/replay passed. Existing portal/CRM calls and task are preserved. Signed dashboard test persisted unassigned event `cmuh77be90001skeq8gca69pd` (`test_call`) at 16:51:43.857 UTC and appeared in the admin inbox. No customer association or recording URL was added.
- Earlier CRM metadata scope failures were reproduced in the stale shared `zoho_token_cache`. A refreshed token passed CRM fields, Books and Inventory reads before replacing that cache only. Independent shared-cache verification now returns HTTP 200 and 37 Calls fields. This supersedes earlier blanket missing-scope notes; other deal-worker configuration/canary gates remain.
- Preserve Ben-only routing and existing record IDs. Fresh real-call acceptance, original-caller correlation, duplicate notices and dedicated CRM transcription upload remain unfinished. See `docs/retell-production-acceptance-20260925.md`.

## Consolidated release and Books deal identity (2026-09-25)

- User explicitly authorized completing outstanding application changes and production deployment. This release combines invoice-backed deal packages, verified invoice calculation/Last calculated changes, and the disabled Telegram agent foundation, while preserving production through PR #122.
- Books `zcrm_potential_id` is authoritative over stale local and legacy name-based invoice links. Invoice, estimate, sales-order, webhook and bulk-import snapshots now preserve the potential ID/name. Missing referenced CRM records and account conflicts remain explicit exceptions rather than duplicate creation.
- A fresh verified backup preceded an exact-ID production import. Potential identities and eligible invoice links were saved with account/version guards and independently read back without mismatches. Private before-images, counts and exception evidence remain in the original workspace `.codex-tmp/deal-sync/`; no provider document was changed.
- Core OAuth still rejects CRM field metadata with `OAUTH_SCOPE_MISMATCH`. The deal worker stays disabled until the required grant, unique identity field, stage/pipeline mapping and canary are verified. Telegram likewise remains disabled without bot credentials. Neither integration is represented as activated merely because its code is released.
- POS PRs #120/#121 are already deployed and accepted: EST-8338 converted exactly once to Sales Order 46568. Do not repeat that conversion. Transcript import continues from its existing guarded checkpoint; completion must be established from the final verification receipt.
- Publication of additional local product/Voice operational scripts is awaiting the user's specific public-repository approval after automatic approval review rejected copying that payload. Private exports, backups and one-off audit files are excluded from the application release.

## Invoice-backed CRM deal packages (in development, 2026-09-25)

- User explicitly requested complete deal packages and invoice-based deal reconstruction in BOTH the portal and Zoho CRM with ongoing synchronization. Implementation is isolated on `codex/invoice-deal-packages` in `C:\Users\titan\.codex\worktrees\invoice-deal-packages\production-main-current`; see `docs/invoice-deal-sync.md`.
- Adds a durable database-trigger queue, serializable exact-identity reconciliation, evidence-based dispositions, an authenticated package view, CRM summary/versioned JSON attachment synchronization, and an administrator configuration/exception screen. CRM native fields/notes are retained; no automatic financial-document or customer-message creation is part of the rebuild. Scheduled CRM writes default to disabled.
- A private read-only production audit identified missing invoice links, cross-account links, CRM owner disagreements, and missing explicit account mappings. The findings and exact counts remain in local ignored evidence; authoritative customer-ID verification is required before mapping.
- CRM Deals reads work, but field metadata returns HTTP 401 `OAUTH_SCOPE_MISMATCH`. Reauthorization with settings-field read scope, unique-field/pipeline/stage validation, account mapping repair, a fresh backup, and canary acceptance are required before activating or claiming synchronized coverage. No live data, provider records, credentials, or deployment state were changed. Private evidence is in the original workspace `.codex-tmp/deal-sync/` and must not be committed.
## Invoice calculation verification (completed pass; exceptions remain, 2026-09-25)

- Scope is invoices only. User confirmed 4.5% of invoice grand total when a card is used and requested a visible Last calculated date. Both runtime calculators now share cent-rounded card-fee logic, exclude explicit ACH/eCheck/Zelle, and preserve authoritative historical/monthly VIG. Invoice processing reads payment evidence before calculating. The existing costsCalculatedAt field is persisted and shown in Arizona time; no schema migration. UI/code release is pending.
- Complete Books enumeration found 7,895 upstream invoices, all present locally. The sole extra local invoice, 10898, remains Orphaned. Coverage proves identity coverage at observation time, not full database sync. Other document types are outside this task.
- The bounded pass finished with 4,221 provider calls against the durable 14,999 cap. All 4,126 planned detail/payment reads plus targeted credit checks completed. A second full enumeration at 12:02:33 UTC found zero added, changed, or removed provider invoices. Final independent DB verification at approximately 12:04 UTC found 6,778 calculated and verified invoices and zero mismatches. 732 remain unresolved: 381 ambiguous payment methods, 321 unverified line costs, 29 missing salespeople, and one payment-total mismatch (invoice 10791). 385 void invoices are excluded and one known orphan is preserved. Full completion is not certified; Offline is not assumed to be card or cash.
- Only local calculated fields, calculation provenance/timestamps, operational audit receipts, and financial-review exceptions are written. Native invoice totals, statuses, payments, payouts, and all provider documents remain untouched. Every batch is version-guarded and read back. A scheduler-only change can be retried only after every source/ownership field still matches the before-image; the refreshed version remains guarded atomically.
- Verified pre-write backup is artifacts/invoice-completion/pre-calculation-2026-09-25T11-08-55-107Z.dump, 331,750,049 bytes, SHA-256 97f6ada52230b652c4e4eaf0b7dd84dc337a2e9d98ef980ac5828ae36ad55ced, with 645 readable restore-list entries. Raw evidence, before-images, per-invoice findings, and apply receipts remain in the ignored artifacts/invoice-completion directory and must not be committed. verification.md and verification.json are the current completion report.
- Validation: focused fee/history/reconciliation/persistence tests (63 including the added credit reconciliation case) and the concurrency guard test pass. Full isolated Next webpack production build passed with a temporary build-only auth secret, and TypeScript passed again after rebasing onto released PR #113. Prisma regeneration was skipped for that build because the active reconciliation reader held the shared Windows Prisma DLL; schema is unchanged.
- Code is committed locally on codex/invoice-calculation-verification in the isolated invoice-calculation-verification worktree. The user explicitly approved pushing the prepared invoice changes while preserving newer work. The branch was rebased without conflicts onto released PR #114 (0333dd9b) before a normal, non-force push. Production deployment has not occurred. The saved calculation timestamps are live in PostgreSQL, but the Last calculated UI change is not deployed. Full invoice-level findings are in exceptions.md and verification.json under the ignored artifact folder.
## Telegram agents (isolated development, 2026-09-25)

- User requested Telegram agents for themselves and sales reps: accounting, graphics, operations, collections, sales, and product expertise. They require actionable recommendations, task execution, evidence-grounded answers, and an observed confidence history before automatic approval can be enabled.
- The isolated `codex/telegram-sales-agents` worktree implements portal pairing, private-chat webhook verification, a durable background reply queue, six role/tool profiles, scoped database retrieval, approved portal task creation/completion, and branded SVG flyer drafts. Each action has an actor-bound expiring approval, concurrency guards, audit, and read-back verification. Telegram and provider credentials have not been configured; nothing is deployed or connected.
- Readiness is computed from human-reviewed, verified outcomes per user/agent/action, not model confidence. Initial eligibility requires 50 reviewed outcomes, 98% correct, score 95+, and no recent failures. Explicit management enablement is additionally required. Only portal-only task creation can initially qualify; this never enables financial writes or customer sends.
- No zero-hallucination guarantee is made. Tools expose source timestamps, coverage, and bounded samples; a second model pass checks answers against evidence. Existing missing account links/transcripts and unsupported source integrations remain visible limitations. No live Zoho reader was added alongside the ongoing transcript import.
- `docs/telegram-agents.md` documents actual capabilities, activation requirements, and gaps. Domain-specific financial writes/customer communications, full-corpus analysis, persistent conversational memory, additional operational hardening, and management configuration of other reps' auto-approval remain follow-ups. User is creating a new bot through BotFather; its username/token configuration and release acceptance are pending.
- Validation: 16 focused authorization/action/confidence tests pass; TypeScript, the isolated Next.js webpack production build, and both Netlify worker bundles compile. No live Telegram or AI-provider acceptance has been performed. Development did not write production business data or send messages.

## Browser-retest lifecycle repairs (production plus reconciliation follow-up, 2026-09-25)

- PR #108 merged as `f7ae55df09a8ce5a00ea647c5e60ef6a85190625` and Netlify deploy `6ab647a19b05db0008ab9d98` published the POS, gift, bundle, address-payload, and communication repairs. Production browser review verified the TEST Account, exact dropship vendor, $0.36 COGS, $0.91 subtotal, and full local Centralia addresses without submitting a document.
- The first exact-account provider-profile reconciliation returned an opaque non-JSON HTTP 500 before provider street verification completed. The follow-up makes Books contact-person discovery use the documented contact-scoped endpoint when customer detail omits the array, decouples profile repair from contact-person persistence, creates the provider-write audit before writes, GET-verifies partial/previous outcomes before any write, quarantines ambiguous timeouts, and always returns stage-aware JSON. No blind retry, financial document, or communication is part of the repair.
- Production verification after that follow-up proved Books customer/contact persistence and the CRM billing/shipping address repair succeeded. Zoho's exact record exposed the remaining custom-field mapping as `Customer_Time_Zone`; the legacy `Time_Zone` key was silently ignored despite a successful update response. The correction uses and verifies the authoritative custom-field API name.

- The catalog product `giftItem` selection remains the source of truth for order-builder gift shortcuts. Ordinary gifts retain the 20%-of-available-profit limit. An administrator can grant one idempotent, audited profit-limit exception to an exact Books-mapped gift; the exception does not change its $0 sales price or authoritative cost. Missing cost remains `UNKNOWN` and is never relabeled as authoritative zero.
- Gift Item information includes an in-app bundle builder. Fixed components reference exact catalog products; variable components reference a shared gift tag such as `shirt`. Saving rejects components without Books mappings or authoritative cost. POS derives the available exact variants and actual component cost, requires the rep to choose the shirt product/size, and persists a server-revalidated selection plus the immediate/paid-in-full release rule in the fulfillment plan.
- The catalog API attaches stored sales quantity to each result. POS applies sold-before-unsold as the final ranking boundary after its functional filters/sorts, while a dedicated image-led `Titan Signature Blades` rail keeps the signature families prominent.
- The shortcut is no longer capped at ten entries. Administrative, inactive, unmapped, unknown-cost, and over-allowance rows remain excluded unless the exact gift has the audited administrator override. The authoritative Titan gift hat (`1254360000043727500`) remains a catalog fallback, but still requires ordinary allowance or that audited override.
- Product information now labels the existing Gift Item checkbox as the control that adds the product to the order shortcut list. This change does not write to Zoho or create a financial document.
- The POS preview renders complete billing and shipping addresses, requires per-line fulfillment before document submission, exposes an audited dropship vendor, and explicitly distinguishes document subtotal from unresolved shipping and provider-calculated tax. Dropship is selectable only when `Product.canDropship=true`; no vendor/stock inference is made. COGS is rendered to cents.
- Books customer address payloads use the documented `address` Street1 key. The administrator reconciliation path can idempotently repair and then GET-verify the exact mapped Books customer and CRM Account address/timezone, with an `OperationalAction` audit receipt.
- Account SMS actions persist an addressed composer-open request across the tab transition. Direct sends use a stable request UUID and durable provider-write state; only explicit Zoho success is accepted, unknown outcomes become `AMBIGUOUS`, and ordinary UI retry cannot duplicate the submission.
- POS account search no longer renders a false empty state before the bounded search response completes.
- Successful POS creation now returns the local/provider document identity to the UI and keeps the Account selected. A post-create action workspace embeds the existing document action panel directly in POS and provides shortcuts into fulfillment/shipping, account-linked follow-up, and the Account workspace. Conversion, invoicing, payment, PO, package, and label writes therefore remain behind their established confirmations and audited handlers rather than being silently chained or reimplemented.

## Sales lifecycle persistence and bounded sync repair (in progress, 2026-09-25)

- The isolated `codex/repair-sales-lifecycle-blockers` branch starts from released PR #94 merge `eb3897cf272d83e266943e078246cbbf38c4242e`. No production write, transaction, communication, migration, or deployment has been performed by this follow-up.
- Unified sync now flushes final partial batches, walks bounded CRM/Books pages, persists a per-table continuation page, resumes an incomplete walk, handles CRM 204, atomically claims its singleton run lock, and never advances `lastSyncAt` after a timeout, bounded page stop, failed transaction, or unresolved account/owner dependency. Upserts make replay duplicate-safe. Cursor timestamps normalize arbitrary milliseconds to the verified CRM shape.
- The pending additive migration `20260925010000_sales_lifecycle_provider_persistence` separates CRM Account/Contact/Lead IDs from Books customer/contact IDs and adds explicit provider states plus durable idempotent provider-write operations. Legacy placeholder IDs are not inferred into the new provider columns.
- Portal lead creation now records a durable CRM operation, validates HTTP and per-record status, stores the returned CRM Lead ID, and marks unknown timeout outcomes `AMBIGUOUS`. An ambiguous create is looked up by exact email plus company before any retry. Conversion uses the stored CRM Lead ID, disables provider notifications, validates returned Account/Contact IDs, and persists those mappings; ambiguous conversion is never automatically resent.
- Focused pagination/cursor tests and TypeScript pass. Disposable migration-chain validation, Books customer persistence, product/gift/fulfillment fixes, full build/bundling, PR review, and production browser/provider acceptance remain required before release.
- PR #95 now has a PostgreSQL 16 CI gate that passed both an empty-database full migration chain and a legacy-schema upgrade rehearsal. Books customer creation is routed through one durable operation keyed to the local Account, persists `booksCustomerId`, reconciles only by an exact stored CRM Account linkage, and leaves unknown POST outcomes ambiguous without an automatic resend; name-only matching was removed. Order submission preserves the authoritative Books item ID, explicitly recognizes Books gift-hat item `1254360000043727500`, and excludes administrative catalog lines from gift/search choices. Production reconciliation, remaining fulfillment safeguards, full release validation, and provider/browser acceptance are still required.
- Quote and sales-order creation now carries a stable client request UUID into a durable provider operation. Concurrent repeats cannot claim the same write; definitive failures are not automatically retried; timeouts and the interval after provider acceptance but before complete local persistence remain `AMBIGUOUS` and require reconciliation instead of risking a duplicate document.
- A bounded read-only production check confirmed the existing lifecycle TEST account and one primary contact, but production does not yet have the pending CRM/Books mapping columns because the migration is not deployed. Zoho Books item reads confirmed DADGR458S is active at $0.45, non-inventory, with purchase cost reported as $0; that is not authoritative evidence of dropship cost/eligibility. The required hat item `1254360000043727500` is active, $0 sales rate, $20 purchase rate, and inventory-tracked. The migration now adds Books item ID, unit cost, and dropship eligibility columns so the portal stops burying these provider facts in description JSON; the order builder includes the verified hat even before the next catalog sync.
- Final release review made missing product cost fail closed: `UNKNOWN` cost cannot be added to an order, while only positive authoritative cost or an explicitly `VERIFIED_ZERO` classification is usable. Unknown dropship eligibility stays nullable rather than being inferred from zero stock. Bounded production discovery selected RFD-50A060 as the acceptance candidate: active Books item `…471505`, $0.91 sell rate, $0.36 purchase rate, purchase account present, sales-and-purchases goods, non-inventory, and exact active preferred vendor `…988542`. Zoho Books does not return a separate dropship-enabled flag; portal dropship eligibility is therefore limited to its existing PO contract requiring a purchase-capable item plus an exact active vendor, never inferred from stock.

## Zoho incremental request contract correction (pending deployment, 2026-09-24)

- Production OAuth reauthorization was completed for the existing Runtime client and its separate Voice refresh token. Bounded read-only checks passed for CRM records/users, ordinary Books reads, Inventory reads, Voice SMS logs, and Voice call logs/recordings. No provider write, sync, import, campaign, or message was performed.
- The historical CRM `INVALID_REQUEST` and Books `Invalid value passed for last_modified_time` errors are request-shape defects rather than permission failures. The unified manual sync reused a Books query parameter for CRM and reduced Books cursors to a date-only value.
- The pending isolated correction sends CRM incremental cursors only as `If-Modified-Since` headers and formats Books cursors as full timestamps with a numeric UTC offset. Both retain a two-minute overlap. Bounded read-only provider checks returned CRM HTTP 200 and Books HTTP 200/provider code 0 with the corrected shapes.
- Zoho Voice WebSDK is not exposed as a configurable integration in the current Voice account. Server-side Voice OAuth remains verified; no WebSDK credential was created or inferred.

## Outstanding update reconciliation (released, 2026-09-24)

- PR #91 was merged as `5050e0e2c9029dc794cd3f8002aa801400e53b9d`, providing the shared Today → Accounts & Deals → Leads workspace navigation across the three sales entry surfaces.
- The remaining valid work from PR #70 is integrated here: the installed Windows PowerShell provisioning runner intercepts console key input without echo or password-length asterisks, refuses to proceed when secure console input is unavailable, clears secret references, and retains the existing exact-target and explicit revoked-replacement guards. No credential is provisioned by validation.
- The remaining valid work from PR #82 is integrated here: user-facing read routes are PostgreSQL-only, provider refreshes are explicit POST actions, missing local evidence fails closed, and the dependency-graph contract prevents accidental Zoho/OAuth access from page-facing GET handlers.
- PR #40 is superseded by the more complete production sync recovery already on `main`, including its additive migration plus mailbox columns/indexes and expanded regression coverage. PR #22 is an obsolete pre-September integration snapshot that would remove later security, campaign, reconciliation, ownership, and AI work if merged; its still-valid operational functionality is represented by later releases.
- PR #92 released the consolidated security and database-read corrections in merge commit `48a7f8ad99f2158e4b16304b26f32ff27c14cbb9`; Netlify production deploy `6ab58136d4b94e0008646ead` published successfully. Superseded PRs #22, #40, #70, and #82 were closed with their disposition recorded, leaving no open repository PR or issue at reconciliation time.

## Sales workspace navigation cleanup (released, 2026-09-24)

- The released cleanup consolidates the duplicated Today / pipeline / lead-queue header actions into one responsive `SalesWorkspaceNav` shared by `/sales`, `/sales/todays-calls`, and `/sales/leads-calling`. It removes page-specific navigation duplication while preserving data fetching, filters, queue position, and every sales write path.
- The consistent flow is labeled Today → Accounts & Deals → Leads. Larger legacy sales-page decomposition and potentially overlapping calling surfaces remain documented follow-ups rather than being rewritten in this low-risk tranche.

## Admin control center and Titan AI release (2026-09-24)

- PR #90 reorganizes Admin into searchable business workspaces and expands Account Assignment from only `Update Status` accounts to an explicit All Accounts / Update Status Only scope. Scope changes invalidate background pagination and clear stale selections and pending owner choices.
- Account ownership remains a dedicated administrator-only write path. Each write now carries the owner observed by the browser plus a unique request ID; the server rejects concurrent owner changes, durably prevents duplicate submissions, records the result in the operational audit trail, and reports related-contact partial failures without representing them as a clean success.
- Titan AI remains mounted in the application shell. Authenticated conversation history is now persisted in bounded, user-keyed browser storage across navigation, refresh, and reopening. Requests refresh route, query, active-tab, and selected-record context; mutating confirmation tokens are bound to their originating page/query so a pending action cannot be confirmed after switching records.

## Admin control-center information architecture (pending PR, 2026-09-24)

- The Admin navigation is organized around Company Settings, Sales Configuration, Compensation & Payroll, Automation & AI, Communications, Products & Data, Integrations, Operations, System Health, and Advanced / Developer Tools. Configuration, monitoring, and dangerous maintenance are now visually separated without changing underlying business logic.
- Existing production pages and APIs remain at their established URLs. `/admin/data-integrations` redirects to `/admin/integrations`, `/admin/people-time` redirects to `/admin/company-settings`, and the existing backfill/geofence compatibility redirects remain intact.
- Potentially data-changing one-time utilities are discoverable only from the warned Advanced workspace. No Admin route, API, database model, provider operation, or historical record was deleted. The detailed KEEP/MERGE/MOVE/ADVANCED/RETIRE audit is in `docs/admin-route-inventory.md`.
- The shared workspace hub now provides responsive search, breadcrumbs, risk badges, and consistent cards. All workspaces retain the existing administrator-role gate; normal users cannot access the Admin shell.
- Account Assignment now defaults to all accounts so administrators can change record ownership regardless of account status. The established Update Status queue remains available as an explicit filter; both views use the same administrator-only owner-change path and preserve synchronized account/contact ownership behavior.

## Durable campaign processing and deliverability (pending PR, 2026-09-22)

- Campaign status reads are observation-only. New campaigns materialize one durable recipient row per selected account and are processed by bounded server-side workers plus a one-minute recovery watchdog; browser polling and local storage are no longer execution dependencies.
- Recipient claims use atomic row locking and expiring pre-submission leases. `SENDING` is persisted before Zoho submission; an interrupted `SENDING` attempt becomes `AMBIGUOUS` and is never automatically resent. Accepted, failed, ambiguous, skipped, and completed recipients are terminal for ordinary recovery.
- The legacy 2,073-recipient MMS job with index 201 and 212 outcomes is explicitly `LEGACY_QUARANTINED`. No recipient rows are synthesized and no ordinary resume is available; its raw missing-result count is evidence for review, never permission to resend.
- Initial Zoho acceptance is stored as submitted rather than delivered. Authenticated Zoho Voice delivery callbacks update final provider states and number-specific technical disposition. Permanent technical failures suppress only the normalized number; opt-out/legal suppression remains separately protected. Temporary and ambiguous failures remain unsuppressed and are never automatically retried.
- A bounded 15-minute reconciliation sweep never sends a probe or guesses delivery. It keeps recent accepted messages awaiting callbacks and moves campaigns with overdue/unresolved receipts to admin review because no documented non-message Zoho Voice carrier lookup is configured.
- Admin Campaign Management includes server-side recovery state, recipient/delivery counts, quarantine warnings, and exportable after-send review. Manual ambiguous retry requires explicit per-recipient confirmation; quarantined legacy messages require a separate reviewed campaign.
- Every callable Zoho Voice SMS/MMS surface now uses the shared number-level suppression guard. Protected opt-out/legal restrictions block all traffic; promotional, scheduled-promotional, and canary traffic also enforce technical suppression. The legacy bulk sender is retired. Campaign and Canary confirmation views expose suppression counts/reasons before submission, and account/contact phone badges expose the affected number's disposition without disabling peer numbers.
- PR validation uses two disposable PostgreSQL 16 databases with workflow-local credentials: one applies and re-applies the complete migration chain, while the other rehearses the legacy upgrade and proves inconsistent/known jobs remain quarantined with no sendable recipients.

## Database-only runtime reads (released via PR #92, 2026-09-24)

- User-facing dashboard/header, pipeline, processing, account/customer, documents/detail/PDF, commissions, Rep Stats, collections, tasks, shipping, catalog, search, product-image, and write-off health reads now use PostgreSQL only. Page-facing document reads moved to `/api/database-documents`; the legacy `/api/zoho-invoices` route remains a PostgreSQL-only compatibility alias.
- Account, task, collections, catalog, shipping detail, document detail/PDF, and product-image GET fallbacks no longer obtain an access token or call Zoho. Missing local evidence returns `LOCAL_DATA_INCOMPLETE`; refresh failures clear stale client financial/queue/catalog state. Document rendering no longer launches cost processing, and shipping row expansion no longer synchronizes from Books.
- Customer CRM update and shipping/provider refresh logic moved to explicit POST action routes. Zoho-prefixed mutation proxies no longer expose GET. Scheduled/webhook importers and explicit administrator/provider mutations remain separate and unchanged in purpose.
- Shared freshness metadata reports PostgreSQL source, last successful bounded import, active run, sanitized last failure, and staleness. Read responses expose server timing, bounded DB query counts, and zero Zoho/OAuth counters. Dashboard/header concurrent summary requests are deduplicated without persistent caching; account/document/catalog result sizes are bounded; commission transforms no longer create unnecessary Promise arrays.
- The strengthened static contract recursively inspects 16 major user-facing GET dependency graphs and rejects Zoho clients, application token providers, and sync/import functions. Detailed runtime corrections, performance bounds, remaining actions, and exceptions are documented in `docs/database-only-runtime-read-migration.md`.

## Rep Stats selected-year roster and company target correction (2026-09-21)

- A read-only production PostgreSQL audit proved the Rep Stats endpoint was seeding all 13 non-test users into the leaderboard before processing documents. Six identities had no qualifying 2026 activity (including the separate Master Administrator login and five zero-activity agent logins), so an excluded missing target incorrectly made company progress appear unconfigured.
- The verified 2026 roster has seven salesperson identities with qualifying activity: Benjamin Bequette (5 invoices), Bobby Salyers (23), Brian Basiliere (1), Montgomery Morgan (164 invoices plus 2 eligible uninvoiced orders), Paul Gencuski (14), Richard Griffin (52), and Ross Haisler (237). Only Montgomery and Ross have September activity; the other five correctly remain visible with zero selected-period results under the established selected-year roster rule. Production has no duplicate-name identities or unresolved 2026 ownership records, and the User model has no separate active/deleted status field; `isSalesperson` plus qualifying selected-year ownership is the authoritative local eligibility contract.
- September targets are authoritative daily-profit settings expanded over 21 configured workdays: Benjamin, Bobby, and Brian are $10,500 each; Montgomery, Paul, Richard, and Ross are $21,000 each. The eligible company target is therefore $115,500, with $14,121.58 company profit and 12.2% displayed progress. Excluded admin/service/zero-year rows no longer affect target completeness. An eligible rep missing a target now produces `Incomplete configuration` with a missing-rep count. Monty's VIG remains permanently 1.0; other reps retain the existing authoritative constant/monthly/default resolution.

## Rep Stats canonical MTD and target correction (2026-09-21)

- A read-only production PostgreSQL audit reconciled September Rep Stats to the company-header contract: 15 eligible invoices plus 2 eligible uninvoiced sales orders, $44,780.89 revenue, $14,121.58 authoritative profit, and zero blocked-profit documents. Both eligible orders belong to Montgomery Morgan; order 46559 contributes $4,499.75 revenue and $1,799.90 profit, while order 46560 is an authoritative legitimate zero. Montgomery moves from 6 invoices / $21,748.75 to 8 sales documents / $26,248.50 and $7,798.91 profit. Ross remains 9 invoices / $18,532.39 and $6,322.67 profit.
- The endpoint already returned sales orders separately, but `/stats` rebuilt period metrics exclusively from `revenue`, `profit`, and `invoiceCount`, then cached that invoice-only result in session storage. The page now consumes the endpoint's canonical combined period contract, labels the count `Sales Documents`, uses no-store requests without session caching, and exposes eligible invoices/orders, excluded orders, and blocked-profit quality in metric drill-downs.
- Production has no September `MonthlyVigGoal` rows for Ross or Montgomery, but both have explicit stored $1,000 daily profit targets. The established fallback is daily target times company workdays: September has 21 configured workdays after the September 7 holiday, producing a $21,000 profit target for each. Montgomery's configured constant VIG is 1.0; Ross uses the configured 1.3 default. Missing targets now display `Not configured` instead of fabricated zero/N/A progress, and VIG is never inferred from a missing target.

## Commission cost-quality and clawback-day correction (2026-09-21)

- A fresh read-only production PostgreSQL audit of Ross Haisler / 2026 found 238 eligible commission documents and reproduced the exact 35-row warning. All 35 are invoices (zero uninvoiced sales orders), total $65,512.11, and are category A: authoritative denormalized cost/profit/dead-profit columns and a stored commission snapshot exist. The query projection retained only `salesCommission` while discarding the `commission` and legacy CF aliases recognized by the canonical helper, so the helper received an incomplete object and falsely blocked all 35. Categories B–E are zero; no Ross/2026 document is genuinely missing authoritative cost evidence, and no financial data repair or Zoho access is required.
- The commission function now emits one canonical `costQuality` result from the same stored-snapshot predicate used to select totals. The banner and sales-sheet rows consume that result instead of the legacy fallback flag. Legitimate zero, negative, and numeric-string snapshots remain authoritative; genuinely incomplete snapshots remain explicitly blocked while revenue stays visible.
- Clawback aging now uses whole America/Phoenix calendar days rather than elapsed-hour fractions. The normalized integer drives display, tier boundaries, sorting, filtering, and counts; negative remaining days clamp to zero, while missing or invalid dates are explicitly unavailable.

## Commission authoritative-snapshot reader audit (2026-09-18)

- Read-only production audit disproved the reported 35-current-block premise: September has 17 qualifying documents (15 invoices and 2 uninvoiced sales orders) totaling $44,780.89. Rep-stats classifies all 17 authoritative; `/commissions` falsely blocks 8 invoices totaling $23,459.30 because it reads legacy JSON profit/dead-profit keys but does not select the authoritative denormalized invoice columns added before PR #63.
- All 8 false blocks are category A: `computedDeadCost`, `computedProfit`, and `computedDeadProfit` exist (including legitimate zero/negative outcomes), and stored commission exists. No data reconstruction, current-catalog fallback, Zoho read, or production mutation is required. Ross Haisler has 5 false blocks / $8,709.60; Montgomery Morgan has 3 / $14,749.70. The other 9 invoices and both sales orders were already recognized correctly.
- The reader-only correction selects and prefers the authoritative invoice columns while retaining the explicit warning for genuinely missing snapshots. Sales totals were never excluded; profit and earned commission for the 8 false blocks were incorrectly displayed as zero. No cost processor, import, sync, backfill, or snapshot repair was run.

## Sales Commission selected-year scope correction (2026-09-18)

- Read-only production proof found the `/commissions` 2026 request loaded 7,497 eligible invoices because its raw invoice SQL never applied the already-computed selected-year filter. Only 496 belong to 2026; 7,001 invoices from 2018–2025 leaked into the selected-year response. All 7,497 invoice numbers are distinct under the endpoint's deduplication rule. The three qualifying sales orders were already correctly year-scoped, so the 2026 response contained 7,500 commission records instead of 499. Ross Haisler was inflated from 237 to 2,686 invoices and Benjamin Bequette from 5 to 9.
- The isolated correction applies the same half-open selected-year date interval to invoice SQL that was already applied to sales-order SQL. It changes no stored financial value, compensation plan, payout, Zoho record, or production data.

## Unresolved Master Administrator provisioning security backlog (2026-09-18)

- A real provisioning invocation returned `MASTER_ADMIN_PROVISIONED=PASS` after reactivating the existing credential record, despite its Windows-hosted password entry being visibly exposed. Database containment is verified: the sole record `cmu7f2a1r00029bu683vstu3x` is revoked and no `LOCAL_MASTER` credential is active. The misleading success result and real-host secure-input path remain a separate security backlog/PR and are not part of commission work.

## Local Master Administrator provisioning security correction (2026-09-18)

- A second production `LOCAL_MASTER` credential was created after the first revoked credential, but its password and confirmation were visibly echoed by the real Codex-hosted Windows PowerShell 5.1 invocation. It is confirmed compromised and must be revoked without authentication, rotation, reuse, or replacement. Revocation remains pending because the prior standalone production environment file is absent and Netlify exposes the production database secret to this local session only as an encrypted placeholder.
- The confirmed defect was host-dependent echo behavior from `Read-Host -AsSecureString`. Windows provisioning now requires a real console input handle and consumes every key with `[Console]::ReadKey($true)`, displaying neither characters nor password-length asterisks. It fails closed when interception cannot be established. Passwords are transferred only through redirected child stdin, never process arguments, environment variables, stdout, stderr, or command history. BSTR buffers are zero-freed and process environment state is restored after every invocation.
- `scripts/install-production-master-admin-runner.ps1` replaces the real `.codex-tmp/run-production-master-admin-provisioning.ps1` invocation path byte-for-byte from the canonical checked-in wrapper and verifies its SHA-256 hash before use.
- Every invocation freshly loads `DATABASE_URL` from the explicit protected production environment file `C:\Users\titan\Documents\ChatGPT\Titan Diamond.env`; the path is an operator-supplied wrapper parameter, not an application runtime constant. Missing, non-file, or malformed input fails before a database process starts. Preflight requires both exact normalized email and expected user ID, rejects missing/ambiguous/mismatched identities, and refuses active credentials. Revoked credentials require the explicit `ReplaceRevoked` mode.
- Credential creation/reactivation and its sanitized audit event are revalidated and written in one database transaction. A failed audit or guard leaves no partial credential change.

## Local Master Administrator authentication (2026-09-17)

- Master authority is now login-method-derived rather than stored on Ben Bequette's shared Zoho identity. Zoho login retains the underlying `Administrator` role with `authSource=ZOHO`; the separate `/master-admin-login` credentials provider issues `MASTER_ADMIN` only after validating a linked local credential and stamps `authSource=LOCAL_MASTER` into the signed server session.
- `LocalMasterCredential` stores only a bcrypt hash plus rotation, revocation, version, failure, and lockout state linked one-to-one to the existing User. `MasterAdminLoginThrottle` provides HMAC-keyed distributed backoff without storing submitted identifiers or addresses. Provisioning, rotation, and revocation are explicit operator commands and never run during builds, migrations, page loads, or login attempts.
- `isMasterAdminSession()` is the canonical capability check: it requires the exact effective role and authentication source, then verifies the current local credential is active, rotated, unrevoked, and version-matched. Existing master-only delegation and write-off health routes use the canonical server helper. Local login, failure, lockout, provisioning, rotation, and revocation produce sanitized audit events and make no Zoho calls.

## Automatic write-off recovery trigger (2026-09-16)

- New malformed-checkbox observations carry nullable, sanitized `SANITIZED_V1` evidence: fixed field-path/type/shape/token categories, one-way source-invoice and payload fingerprints, and the source modification timestamp already present in the bounded payload. Existing rows remain physically untouched and are reported as `LEGACY_UNKNOWN`; no raw malformed value or customer/document content is stored. Exact source-version replays remain idempotent while a changed source modification timestamp is retained as a distinct observation.
- The no-store MASTER_ADMIN-only health response now adds aggregate anomaly reason/path/type/token counts, legacy count, distinct and repeated fingerprint counts, exact-replay duplicates, observation bounds, and a checkbox-like-string evidence flag. It remains a local PostgreSQL read with no Zoho calls or mutation.

- A no-store `GET /api/admin/write-off-recovery/health` endpoint allows MASTER_ADMIN, ADMIN, and Administrator roles while denying managers, collections, salespeople, and unauthenticated users. It reports catalog booleans, aggregate recovery safety counts, and fail-closed readiness from local PostgreSQL only, with no writes, repairs, synchronization, provider calls, or identifier disclosure; missing schema returns HTTP 503 with `syntheticTestReady=false`.

- The existing bounded Books invoice import now consumes the already-fetched Boolean `cf_written_off` field and creates one local `DRAFT` / `PENDING_EVIDENCE` recovery case on either false-to-true or first-observed true. The case snapshots 5000 basis points and never posts a charge, reversal, ledger event, wage change, payout change, or Zoho write.
- Case identity is unique by both local invoice and `(cf_written_off, Zoho invoice id)`. Sanitized transition evidence has a unique idempotency key and a database-enforced append-only trigger. True-to-false preserves the case and flags manager review.
- Missing historical cost, salesperson snapshot, or commission evidence is stored as a blocker; approval and adjustment paths reject incomplete evidence or a missing salesperson before ledger activity.
- Both the authenticated bounded import and the existing disabled-by-default 15-minute bounded job use the shared local persistence boundary. The trigger adds zero Zoho calls, expands no range/page/resource, and recovery pages remain local-PostgreSQL-only. The repository-wide provider-call inventory and API conservation findings are documented in `docs/write-off-recovery-trigger-and-zoho-api-audit-2026-09-16.md`.
- The optional checkbox is ingestion-safe: missing values leave state unobserved, while non-Boolean values persist the invoice and append sanitized local parse-anomaly evidence without coercion, customer data, a recovery case, or another Zoho request. Valid Boolean observations remain atomic with the invoice upsert.
- The shared trigger intentionally has no Next.js `server-only` marker because the bounded Netlify function imports it directly. Contract tests enforce trusted server entrypoints and prohibit client-component imports; the module retains Node hashing and no browser-facing dependency path.

## Financial dashboard and commission surface correction (2026-09-16)

- Executive Dashboard and home-dashboard MTD sales now consume the same role-scoped invoice-plus-eligible-uninvoiced-sales-order contract as the global header. The previously displayed $40,281.14 was invoice-only; the verified production contract is 15 invoices plus 2 uninvoiced orders totaling $44,780.89.
- Executive totals use stored authoritative dead cost, dead profit, net profit, and canonical planned commission. Missing cost snapshots fail closed and are explicitly counted as blocked; financial reads no longer invent a percentage cost or commission. Converted or invoice-linked sales orders are excluded.
- Executive metric tiles are clickable and show the contributing document set. The commissions GET path no longer calculates or persists costs, no longer applies fallback percentages, returns no-store responses, and the commissions page no longer retains a 15-minute session-cache snapshot.

## Manager-controlled write-off recovery design (2026-09-15)

- A 2026-09-16 read-only Zoho Books metadata audit verified the existing active invoice checkbox as visible label `Written Off?`, API name `cf_written_off`, type `check_box`, and searchable. Webhook payload inclusion and field-history retention remain UNVERIFIED. The minimal proposed Zoho footprint is this existing trigger plus optional sandbox-only Recovery Case ID and Recovery Status fields whose Zoho-assigned API names remain UNVERIFIED.
- Calculations, rates, overrides, cost evidence, inspections, hashes, approvals, reversals, balances, versions, and immutable ledger history remain application-only. Live metadata exposed invoice, invoice-line, credit-note, sales-order, contact, PO, bill, and item field capabilities, but no authoritative invoice-line historical product-cost or accepted-return-inspection field.
- Trigger viability remains blocked: the existing Books webhook maps `cf_written_off`, but it does not create an idempotent blocked recovery case. The future contract confirms the checkbox through a targeted invoice GET, uses a unique transition key, creates a non-posting blocked draft, and treats reversion as review-required rather than deleting or automatically reversing history. Zoho synchronization remains disabled.

- A read-only Netlify production audit found zero written-off invoices and zero clawback rows. The legacy direct write-off route guessed cost, used floating-point mutable invoice fields, and lacked dry-run, idempotency, return inspection, independent approval, and an immutable commission ledger.
- The additive recovery subsystem stores integer-cent `WriteOffRecoveryCase`, cost/recovery components, return inspections, append-only ledger events, and a default 5000-basis-point policy. Database triggers prohibit ledger update/delete; corrections, refunds, returns, and waivers are new versioned events.
- Included costs and recoveries follow the documented 50% rule. Accepted returns require receipt plus independent inspection as resellable; damaged/missing/unsellable items receive no automatic credit. Previously paid commission reversal and cost-responsibility debit are separate ledger entries.
- Direct legacy write-off is disabled in favor of dry-run plus independent manager approval. Written-off invoices remain excluded from goals and commission earnings. Manager views are company-wide; salesperson views are self-scoped and redact evidence/provider/actor identifiers.
- Zoho sync is disabled and no write path exists in this subsystem. A proposed, unapplied Zoho field/custom-module manifest, gap analysis, assumptions, blockers, and dry-run examples are in `docs/write-off-recovery-design-2026-09-15.md`. No production or Zoho mutation was performed.
- The post-deployment smoke audit found the original calculator did not require a historical-product-cost component. The isolated correction now fails closed unless an approved positive historical product cost is sourced from an invoice line, purchase-order line, or vendor-bill line; catalog fallbacks and aggregate commission snapshots cannot authorize a case.
- The same smoke audit found recovery events are not yet included in the aggregate commission balance and the supplied reversal amount is not derived from documented invoice earnings. Real approvals remain blocked until separate reversal approval and carry-forward accounting are implemented without retroactive invoice-level payout allocation.
- Write-off recovery percentage fields use a `50.00%` business default, normalized only at the integration boundary to internal `5000` basis points. Individual overrides require an authorized audit reason and preserve the original policy rate. This contract is isolated from ordinary salesperson commission plans. Zoho field API names remain UNVERIFIED because sandbox metadata was unavailable; sync stays disabled and no production fields were created.
- The write-off recovery engine is explicitly server-only and owns Node cryptographic hashing, approval, audit, ledger, and persistence calculations. The client recovery page imports only a browser-safe shared percentage/display module, preventing Node crypto from entering the Netlify client bundle; authoritative dry-run hashes remain server-generated.

## Global-header Netlify runtime scope audit (2026-09-15)

- Post-PR #58 visual verification exposed that the earlier evidence came from local Docker while the live browser used Netlify production. A new Netlify `DATABASE_URL` audit ran only in `BEGIN TRANSACTION READ ONLY`/`ROLLBACK` and found: WEEKLY $4,499.75 (4 documents), MTD $44,780.89 (15 invoices + 2 active uninvoiced orders), PROFIT $14,922.00, COMM $7,460.99, PIPELINE $166,054.33 (68 invoices + 2 orders), and OVERDUE $79,138.92 (42 invoices). There are zero sync-conflict/pending-fetch invoices or orders.
- The deployed $37,292 header MTD dropped September 1 date-only records by starting the month at 07:00 UTC. The former $40,281.14 dashboard card was invoice-only; it now consumes the same scoped invoice-plus-active-uninvoiced-order summary as the header and returns $44,780.89 for current administrators. Currency-formatted stored commission/profit values also parsed as zero in the header.
- Header scope is now explicit and atomic: MASTER_ADMIN, ADMIN/administrator, manager, and collections roles receive consistently company-wide values labeled `Company`; ordinary salespeople receive only owned/assigned documents labeled `My`. The dashboard MTD Sales card uses that identical scope and calculation contract.
- Header and dashboard financial reads are no-store. Invalid/non-2xx/unscoped header responses clear displayed totals rather than retaining stale values. No production data, sync, Full Sync, reconciliation Apply, Zoho write, or deployment mutation was performed. Full evidence and rules are in `docs/global-header-runtime-audit-2026-09-15.md`.

## Global-header financial metric audit (2026-09-15)

- A read-only production PostgreSQL audit established exact global-header corrections: WEEKLY $4,499.75 unchanged; MTD $74,519.72 to $44,780.89; PROFIT $13,122.12 unchanged; COMM $4,193.52 to $6,561.04; PIPELINE $188,786.42 to $165,175.77; OVERDUE $72,243.18 unchanged.
- MTD double-counted 11 already-invoiced sales orders totaling $29,738.83. PIPELINE included two orphaned orders totaling $20,460.95 and one invoice-linked partially-invoiced order totaling $3,149.70. COMM incorrectly represented earned upfront/final portions instead of canonical profit-based commission.
- The corrected header rules include active invoices plus active uninvoiced sales orders for WEEKLY/MTD, exclude estimates and all draft/terminal/orphaned/unresolved/converted records, use authoritative issue/order/due dates, use subtotal for sales, stored profit/commission without approximation, invoice balance for collections, and retain the established Paul Gencuski/Genkuski sales exclusion.
- All six figures now come from one no-store local-database summary refreshed every 15 seconds and on tab visibility, preventing mixed endpoint/cache snapshots. The audit ran only inside `BEGIN TRANSACTION READ ONLY` and `ROLLBACK`; no Full Sync, reconciliation Apply, Zoho write, or database mutation occurred. Detailed evidence and rules are in `docs/global-header-financial-audit-2026-09-15.md`.

## Integration review handoff (2026-09-02)

- Integration branch: `integration/titan-release`; its first parent is the exact sales-portal `main` SHA `e9bc9244f7e3d10d6b0ecbfdfca73924fcab1979`.
- Rollback branch: `backup/pre-titan-integration-20260902` at the same SHA. Only the integration branch is intended for push/review; main and production remain untouched.
- Excluded environment files, temporary work products, backups, outputs, caches, logs, dumps, and `.codex` artifacts were removed from the integration commit. No secrets are recorded here.
- Approved financial rules remain: compute commission from canonical profit, use subtotal (not grand total) as the credit-card fee base, and exclude draft, void, orphaned, and unresolved records from active sales totals.
- Full all-time Zoho reconciliation remains an outstanding operational task; this review does not claim provider completeness.

Last reconciled: **2026-08-22 (America/Phoenix)**

This file is the durable handoff for new Codex tasks. It consolidates the
material status from the tasks titled **Review project**, **Redesign TV
dashboard display**, **Match blade images to SKUs**, and **Sync catalog
attributes and products**. Conversation claims are recorded as history; verify
live state before destructive changes or external writes.

## Current source and environments

### Pearl 2026 catalog image intake (2026-09-02)

- The linked Pearl 2026 catalog was downloaded to the temporary PDF workspace
  for review. It contains 124 pages and 1,307 embedded image objects.
- The extracted candidates were visually rejected as unsuitable. They were
  moved to `output/vendor/_rejected-pearl-2026-extracted/` and must not be
  selected, mapped, published, or uploaded to Zoho.
- Product matching and publication require SKU-level verification and rights
  approval; do not present Pearl branding or source imagery as Titan product
  content without that approval.

### Admin invoice sync repair (2026-09-02)

- The Admin `/api/sync-now` route was sending the stored ISO timestamp directly
  to Zoho Books as `last_modified_time`; Zoho rejects that value with HTTP 400
  (`Invalid value passed for last_modified_time`). This caused Admin-triggered
  invoice syncs to report zero records and prevented downstream calculations.
- The route now normalizes the cursor to Zoho's `YYYY-MM-DD` format and includes
  a one-day overlap so date-only boundaries cannot miss changes. TypeScript and
  the development build passed.
- Dev was rebuilt and verified at `http://localhost:3001/login` (HTTP 200).
- Production was backed up at `backups/tdgpt-20260902-095309.dump`, rebuilt,
  migrated, restarted, and verified healthy at `http://localhost:3000/login`.
- The background Books worker remains active; all-time reconciliation remains
  paused until the provider quota/backfill window is intentionally resumed.
- Docker builds now use BuildKit cache mounts for npm downloads and Next.js
  compilation work, preserving unchanged dependency/build artifacts between
  deployments. The large runtime product-image set remains in the image so
  catalog/image serving behavior is unchanged.

- Repository: `C:\Users\titan\Documents\ChatGPT\Titan Diamond`
- **Authoritative production for current work is local Docker/WSL**, not
  Netlify. Production is `http://localhost:3000` and LAN access has used
  `http://192.168.0.108:3000`.
- Development is local Docker on port **3001**. Production must stay available
  while changes are tested on dev. Promote only after approval.
- On 2026-08-21 both `http://localhost:3000/login` and
  `http://localhost:3001/tv` returned HTTP 200.
- Production was most recently rebuilt from the **entire current working tree**
  with `scripts/deploy-selfhost.ps1`; its backup, build, migration, restart,
  Books worker, and health checks passed.
- Safe production command from Windows PowerShell:

  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-selfhost.ps1 -ConfirmProduction DEPLOY -HealthTimeoutSeconds 180`

- Docker runs through Ubuntu 24.04 WSL and is not reliably available as a
  `docker` command in Windows PowerShell. Use repository scripts or `wsl -d
  Ubuntu-24.04 -- bash -lc ...`.
- A production database backup is mandatory before every deployment or risky
  data operation. Backups are retained under `backups/` for 14 days.
- Git state is intentionally mixed: at reconciliation there were **300+ dirty
  entries**. These changes are user/project work;
  do not reset, clean, overwrite, or discard them.
- `main`/`origin/main` currently points to `40a4a37` (formatted product images
  and SKU mappings), while local Docker production contains later uncommitted
  work. Do not assume GitHub represents the full deployed application.
- Netlify configuration remains in the repo but is not the current deployment
  target unless the user explicitly changes that decision. On 2026-08-21 the
  user explicitly removed Netlify from the active reconciliation scope.

## Local environment reconciliation (2026-08-21)

- Local Docker production is the authoritative dataset. Production and dev
  now have the same seven Prisma migrations through
  `20260821120000_product_catalog_attributes`.
- A guarded clone utility exists at
  `scripts/clone-production-to-dev.ps1`. It requires `-ConfirmClone SYNC`,
  backs up both databases, stops only the dev app, replaces the dev database,
  restores production data, restarts dev, and verifies health/counts.
- Production and dev key-table counts matched exactly after the clone:
  Account 7,935; Contact 7,082; Deal 8,043; Invoice 7,857; LineItem 58,552;
  Payment 7,412; Product 4,187; PromotionDraft 1; Quote 7,852; SalesOrder 366;
  Task 24; User 12.
- Host, production container, and development container each contained 2,539
  files under `public/product-images`; aggregate hashes matched. The
  `src/lib/image-map.json` hash also matched in all three locations.
- Private/generated working directories (`All Pics`, `Sopify data`, outputs,
  Codex artifacts, backups, and accidental shell files) are ignored by Git and
  must not be pushed. Application source, migrations, PWA/brand assets, and
  operating scripts remain eligible for intentional source control.

## Product direction and non-negotiable rules

- The app is the operational source for users: normal page reads should use the
  local PostgreSQL database, not live Zoho calls.
- Zoho Books changes should sync into the local database automatically; app
  changes should sync back to Books promptly. Minimize API calls, use targeted
  endpoints, persist every retrieved record and line item locally, and batch
  custom-field updates into one PUT per record.
- When both systems changed the same record, detect the conflict, identify the
  newest version, and require approval before overwriting questionable data.
- The user wants robust automation but infrastructure redesign is deferred.
- Names shown in operational interfaces should be uppercase.
- Benjamin Bequette is both **system administrator and sales representative**;
  avoid duplicate/legacy identity records or abbreviated `Ben Bequette`
  attribution.
- Titan Diamond’s system-wide contact number is **(480) 470-2577**.
- The user stated the business does **not use Twilio**. Legacy Twilio code and
  AGENTS references may still exist; do not expand Twilio use without explicit
  confirmation. Zoho/other communication paths should be verified first.
- Gift items remain in accounting/order history but must not appear as normal
  products in the public shop or customer-facing catalog.
- Production data is sensitive. Never include credentials, tokens, `.env`
  contents, customer data, or database dumps in commits or context files.

## Sales, financial, and commission rules

- Sales/goal totals treat valid invoices and sales orders as booked sales;
  payment status must not be required for goal credit.
- TV dates use invoice `issueDate` and sales-order `orderDate`; record
  `createdAt` is not an acceptable transaction-date fallback.
- Estimates without a genuine estimate transaction date must not be counted in
  TV totals. Never invent a date from creation time.
- Monthly sales sheet: include invoices (including drafts) and valid
  uninvoiced sales orders; **do not include estimates**.
- Avoid double counting converted documents. An estimate converted to a sales
  order or an order converted to an invoice must contribute once in the correct
  current document class.
- Display real document numbers, not Zoho record IDs; color-code document types.
- The primary financial metrics are subtotal, dead cost, and dead profit.
  Commission must come from the applicable compensation plan/ledger and must
  not incorrectly depend on paid status.
- Missing dead cost/profit on a displayed invoice or sales order should be sent
  through the authoritative cost processor and synced, not approximated in UI.
- Commission clawback aging is global across all reps and is based on invoice
  due date, independent of the selected commissions year. The default policy
  flags invoices at 30 days overdue and reaches write-off at 120 days overdue;
  admins can change the write-off threshold and warning window in settings.

## TV salesboard status

- The `/tv` experience was rebuilt for large displays with a dark black,
  orange, white, and complementary-color palette, motion, rankings, goals,
  rep/day performance, company KPIs, and a persistent weekly lower section.
- Weekly rep/day rows are ordered highest to lowest; day leaders receive visual
  recognition. Rep names are left aligned.
- The official Titan helmet/full logo artwork is used; excessive glow was
  reduced for readability.
- The production audit task reported:
  - 472 valid 2026 invoices audited
  - 0 missing costs/profits after repair
  - 0 missing salespeople
  - 0 sync conflicts
  - two valid active sales orders complete
  - deleted Zoho sales order `46529` quarantined as orphaned and removed from
    TV totals
- Cost-repair logic covers invoices and sales orders and resolves stale order
  IDs by authoritative document number. The protected repair route is allowed
  through the global proxy but validates its own TV/admin authorization.
- These were verified in the TV task at commit `9ed8d80`; later local Docker
  deployments include that work. Re-audit live data whenever totals appear
  stale because Zoho documents change frequently.

## Product catalog, attributes, and images

- Product cutouts are now rebuilt from untouched masters with
  `scripts/rebuild_product_cutouts_from_masters.py`; it does not recursively
  process the older cutout directory. Approved outputs live in
  `public/product-images/cutouts-v2/` as transparent 1200×1200 PNGs, with the
  subject occupying roughly 91–94% of the canvas. The 2026-08-22 pass approved
  358 unique masters and quarantined 23 non-uniform sources in `skipped.json`
  rather than publishing damaged edges. The public image map points to v2 only
  when a successful output exists, while skipped products retain their prior
  safe image. All 12 Signature families use the v2 master-derived artwork.

- A product-attribute migration exists at
  `prisma/migrations/20260821120000_product_catalog_attributes/` and was applied
  to local Docker production.
- Admin catalog importer exists at `/admin/catalog-import` with preview/apply
  workflow.
- Import defaults to **fill empty fields only**. Existing non-empty values are
  preserved. Conflicts, inferred classifications, and questionable records are
  shown in a diff/review table.
- **Create missing products** is a separate option and defaults off. Unknown
  SKUs show `Will skip` unless explicitly enabled.
- Shopify/product CSV handling retains size, segment height, dimensions,
  equipment, product/tool type, applications, suitable materials, blade/handle
  material, color, options, tags, SEO, metafields, Google Shopping attributes,
  and generic additional attributes.
- Catalog search indexes attributes. Filters cover product type, tool type,
  equipment, material, application, size, vendor, and manufacturer.
- Catalog pagination supports 25/50/100/200 page sizes, range counts,
  previous/next, numbered pages, automatic reset on filter changes, and proper
  empty/loading states.
- Image matching/history:
  - 4,186 current products were used in the matching audit.
  - 438 product records were matched and updated with formatted images.
  - 693 SKU image-map entries were integrity checked; 381 unique referenced
    assets and zero missing files were reported.
  - Zoho image queue completed 395/395 uploads successfully after rate-limited,
    resumable retries.
  - 32 Titan Blade products received themed artwork.
  - `ductile iron.png` remains intentionally unmatched because no current
    product exists.
  - Match report: `outputs/zoho-image-matches/Zoho Image Match Report.xlsx`.
- Formatted source assets and scripts are retained under `All Pics/`,
  `public/product-images/`, and `scripts/`. Preserve originals and rollback
  manifests.
- The public `/signature-series` page now reads current product rows from the
  local PostgreSQL catalog, groups non-wholesale variants into 12 named Titan
  blade families, and resolves authentic artwork through `src/lib/image-map.json`
  with publish-ready image fallbacks. It exposes customer-safe specifications,
  SKUs, sizes, applications, materials, equipment, and manufacturer data while
  keeping costs and Zoho item IDs private. The page is force-dynamic so completed
  Zoho-to-local syncs appear without a rebuild. Its futuristic motion treatment
  preserves the ember canvas and honors reduced-motion preferences.

## Flyer Studio and AI

- Admin Flyer Studio route: `/admin/flyer-studio`.
- Intended workflow:
  1. Giveaway product URL or pasted/uploaded retailer screenshot.
  2. Search and select an active Titan product (no category requirement).
  3. Use selected product and giveaway imagery/data.
  4. Generate contractor-focused marketing copy in the established gritty,
     premium Titan flyer style.
  5. Generate fresh AI artwork—not a form-box template—for both SMS and email.
  6. Save/assign to SMS, email, or phone campaigns.
  7. Build complete costs: package price minus blade/product cost, gift,
     tariff, VIG, commission, packaging, handling, shipping, payment fees, and
     other overhead; show profit.
  8. Build the Zoho package/bundle and add required promo products.
- Retailer pages often return HTTP 403. Screenshot paste/upload is the approved
  fallback and must actually populate extracted product data.
- AI image generation requires a valid runtime `OPENAI_API_KEY`. A prior
  production key returned HTTP 401; never store or paste keys in source or chat.
  Ollama is useful for local text work but is not a replacement for high-quality
  image generation.

## PWA / Chrome installation

- The local production app is now a Chrome-installable PWA.
- Manifest: `/manifest.json`; service worker: `/sw.js`; branded offline page:
  `/offline.html`.
- New helmet icons: `public/titan-app-icon-{192,512,1024}.png` and
  `public/titan-apple-touch-icon.png`.
- Installed app start URL is `/employee-login`.
- The service worker does **not** cache authenticated pages or API responses;
  it only provides a static offline navigation fallback.
- Chrome install works on `http://localhost:3000` because localhost is treated
  as a secure context. Installing from plain HTTP LAN address
  `http://192.168.0.108:3000` requires HTTPS first.

## Other implemented areas reported across the main task

- PostgreSQL migration baseline was repaired and validated.
- Local production data replaced test data using guarded backup/candidate/
  rollback transfer tooling.
- Secure self-service password changes were added.
- Health watchdog, backups, self-host start/stop scripts, and optional
  Cloudflare Tunnel support exist.
- LAN access was configured through Windows port proxy/firewall.
- Zoho SSO requires a server-based OAuth client with exact redirect URIs; a
  Zoho Self Client cannot serve interactive application login.
- Collections should expose every available company contact phone as clickable
  call actions.
- Fixed overlays/modals must use `createPortal(..., document.body)` to escape
  clipping.

## Public storefront refresh (August 2026)

- Public hero artwork now has a coordinated 15-scene field series under
  `public/images/hero/field-series/`. Every scene uses the homepage hero as its
  lighting/grade reference and the real 14-inch patriotic `THE TITAN` blade as
  its product reference on a realistically proportioned STIHL TS 420-style
  handheld saw. Routes use unique jobsites and actions while retaining dark
  copy space, restrained sparks, authentic PPE, subtle American flags, and the
  existing reduced-motion overlays. The reproducible API workflow is
  `scripts/generate-public-hero-series.ps1`; never store its API key in source.
- Product application and material presentation is consolidated into the
  controlled `publicUseCases` taxonomy in
  `src/lib/public-product-normalization.ts`. Public and internal catalog filters
  expose one `Cuts / Application` selector instead of redundant application and
  material selectors. Public detail cards and Signature cards also show the
  combined field. Raw `Product.application`, `Product.materials`, and imported
  source attributes remain stored unchanged for integrations and auditing.

- The public site now uses a shared dark industrial visual system with restrained
  ember motion, atmospheric grid/aurora layers, and reduced-motion support.
- `/shop` has expanded customer-facing search, sorting, facets, result counts,
  pagination, responsive filters, and a product details modal. Its search/sort
  toolbar sticks flush to the viewport top with no offset gap.
- `/api/public/products` is the dedicated unauthenticated catalog feed. It
  exposes customer-safe product details and omits pricing, costs, inventory,
  and Zoho identifiers. Product imagery resolves through the maintained image
  map, including current Zoho-sourced blade images.
- Many legacy products still have empty structured catalog columns even though
  their Zoho description contains usable specifications. The public products
  API safely normalizes those descriptions into size, application, material,
  equipment, and product-type facets at read time. It must never expose the
  cost, retail, itemId, or other private keys embedded in the raw description.
- Public catalog facets use controlled application/material groups and
  diameter-only normalized sizes; raw Shopify SEO, Google Shopping, pricing,
  arbor, RPM, grit, and segment notes must not become filter options. Approved
  technical values such as segment height and slot type may be exposed only as
  sanitized product details.
- Manufacturer and vendor remain stored for internal purchasing/integration
  use but are omitted from the public products API, filters, and product views.
  Customer-facing blades are branded Titan Diamond USA.
- The two July 2026 Shopify exports use `TDU-`-prefixed SKUs while Zoho/local
  products store the same identifiers without that prefix. The guarded
  `scripts/repair-catalog-from-shopify.ts` utility normalizes only for matching
  and fills empty local fields without renaming SKUs or overwriting populated
  values. On 2026-08-21 its development-only run matched and repaired 318
  products: 288 sizes/applications, 271 equipment values, 278 material sets,
  and 318 attribute maps/product types. The 1,328 unmatched CSV SKUs were not
  created. Production has not received this repair.
- The transparent 2026 brand variants live under
  `public/images/brand/logo-system/`. Use the horizontal logo at large sizes,
  the wordmark in compact headers, and the helmet mark for narrow/mobile uses;
  readability takes priority over fitting the full lockup into small spaces.
- `src/components/PublicSalesSections.tsx` supplies the reusable conversion
  layer on customer-facing selling pages. It routes visitors by concrete,
  asphalt, and core-drilling applications; explains cost-per-cut buying logic;
  and prompts customers for the five inputs needed for a useful tool match.
  Login, legal, quiz, and calculator routes intentionally omit this layer.
- Shared sales artwork combines the official transparent helmet/wordmark with
  real project blade and cutting imagery. The mark itself must remain unchanged;
  realistic or cinematic depictions can be used as supporting atmosphere when
  copy contrast and product accuracy remain intact.
- `PublicHeroAtmosphere` provides route-aware hero imagery across public pages,
  combining real cutting/product assets, the transparent helmet watermark,
  restrained light motion, and strong dark copy gradients. Login and legal
  pages intentionally omit it, and reduced-motion preferences remain honored.
- The homepage includes `SignatureBladeShowcase`, a content-led presentation of
  current Dragon, Medusa, Zeus, and Barbarian catalog families. Each card opens
  a body-portal slideout with size/SKU context, practical ordering guidance,
  a prominent sticky close control, and links to all 12 live Signature families.
- Public header stacking is explicitly above shared page layers so Pro Tools and
  Applications dropdowns do not render behind hero, catalog, or sales content.
- Product purchase incentives use `src/lib/product-offers.ts` and are stored in
  the existing `Product.attributes.publicOffer` JSON field. Every offer has the
  fixed $100/$250/$500/$750/$1,000/$2,500/$5,000/$10,000 tier framework, while
  each product and tier must be explicitly activated and configured before the
  public catalog advertises a discount, package price, or giveaway. Admins edit
  eligibility at `/admin/product-offers`; configured giveaway SKUs are validated
  against real products and their public name/image is snapshotted into the
  offer. Manufacturer/vendor and protected price/cost data remain private.
- The public catalog detail portal now provides all sanitized product fields,
  application/material/equipment context, and the configured volume/gift ladder
  with tier-aware quote links. Unconfigured tiers are presented only as volume
  quote thresholds and never as promised promotions.
- Route hero atmosphere now uses real night-jobsite concrete-cutting photography
  on company/contact-style pages, application-specific tooling imagery elsewhere,
  and a low-opacity animated flag, dust, sparks, light beam, and helmet watermark.
  The flag is environmental rather than promotional, and reduced-motion settings
  disable the movement.
- Public hero scenes are route-specific rather than a repeated universal banner:
  home, catalog, Signature, applications, core drilling, surface prep, blade
  finder, comparator, resources, RPM, unit conversion, knowledge test, about,
  careers, and contact each receive a distinct source image, crop, or treatment.

## 2026-08-24 intro-offer rebuild and real-order semantics

- `/intro-offer` now presents the live catalog offer for SKU `IF30PV1412E-PP` (`THE PATRIOT PRO`) at the authoritative $99.99 pack price: buy one 14-inch blade and receive the second blade free, with free freight.
- The landing page was rebuilt with the official Titan brand system, real product imagery, responsive offer summary, accessible delivery form, commercial-invoice review, and representative-assisted completion.
- Fabricated countdowns, synthetic live-order activity, unsupported savings/performance claims, and external stock-video dependencies were removed.
- Intro-offer pricing and pack limits are server-owned in `src/lib/intro-offer.ts`; the API ignores client-supplied pricing and recomputes the total.
- The public request endpoint validates contact and shipping details and persists a high-priority sales task containing the exact SKU, quantity, total, delivery address, and requested fulfillment method.
- Intro-offer requests now return `PENDING_CONFIRMATION`. They never report a card as charged or commercial credit as approved; no card data is collected on the page.
- TypeScript, targeted ESLint, and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
- `/login` is the canonical authentication entry with Contractor, Employee, and
  Admin modes. Contractor access retains OTP verification, employees can use
  Zoho SSO or staff credentials, and administrators use Zoho SSO plus role
  enforcement. Legacy `/employee-login` and `/admin-login` URLs temporarily
  redirect to the corresponding canonical mode so bookmarks and auth callbacks
  continue to work.
- Public stacking follows a fixed hierarchy: atmospheric artwork, page content,
  sticky catalog controls, public header/dropdowns, floating assistants, then
  body-portaled product and Signature dialogs at z-index 11000.
- Homepage Featured Diamond Tooling uses a varied bento composition with six
  real transparent product cutouts rather than white-background source photos.
  Catalog cards and the product detail portal use `PublicProductImage`, which
  non-destructively removes connected near-white presentation canvas in the
  browser, tightly refits the tool, and preserves the original Zoho/local image.
  Cross-origin images that cannot be sampled safely retain their original
  fallback rather than failing the card.
- The homepage feature is now Signature-only: six live families are shown at a
  time with previous/next controls for the remaining six. Mobile uses a
  touch-scroll, snap-aligned single-card presentation plus compact arrow and
  progress controls. Cards use the real Signature blade assets and current dev
  catalog variants, SKUs, sizes, applications, materials, and saw fit.
- Public-facing size/application/material/equipment output is consolidated by
  `src/lib/public-product-normalization.ts`. Equivalent diameter spellings are
  emitted once in inch format, and free-form equipment/material strings map to
  controlled customer-facing labels while raw source data remains stored.
- The public header must use the higher-specificity
  `.public-site > header.z-sticky` stacking rule; the generic public child rule
  otherwise wins specificity and places dropdowns behind hero content. Desktop
  dropdowns support both hover and click/keyboard state.
- Development port 3001 uses Next webpack dev mode in `compose.dev.yaml` because
  Turbopack recursively scans the 10,000+ mounted product-image files and can
  hang or panic on the Windows/WSL bind mount. Production build settings are
  unchanged.

## Known risks and open verification work

- The working tree is very large and mixed. Before any commit, enumerate and
  stage an intentional scope. Before a whole-tree deployment, state explicitly
  that it will include all current local changes.
- The deployed local tree is ahead of Git. A future task should create a
  reviewed consolidation commit/branch only after separating generated assets,
  temporary artifacts, dumps, and user data from source.
- Untracked root artifacts such as `.codex-tmp/`, `.codex-artifact/`, `outputs/`,
  `All Pics/`, and stray field-name files require classification; do not delete
  them without approval.
- Turbopack builds report broad filesystem tracing warnings around admin image
  routes. Builds pass, but tracing should be narrowed for performance and image
  size.
- Full UI consistency/permissions audit remains an ongoing goal: non-admin
  sales hub and admin pages need responsive visual checks, table search/sort/
  filters, expanded-section validation, and rep-level authorization verification.
- Re-verify Ross Haisler commission results and Benjamin Bequette attribution
  against live compensation plans after any commission-engine change.
- Zoho data changes often. Use incremental Books sync and authoritative cost
  processors before declaring dashboard numbers current.
- Infrastructure planning for a dedicated in-house Windows host and broader
  remote HTTPS access was intentionally deferred.

## Validation and operating habits

- Read the relevant Next.js 16 guide under `node_modules/next/dist/docs/` before
  changing framework APIs or file conventions.
- Prefer `rg`/`rg --files` for discovery.
- Run `npx tsc --noEmit` and `npm run build` for significant releases; run
  focused tests/lint proportional to the change.
- Verify production endpoints and Docker health after deployment; do not infer
  success from a build, Git push, or container start alone.
- Keep dev on port 3001 and production on 3000. Do not mutate production while
  testing unless the user explicitly approves promotion or a specific data
  repair.

## 2026-08-21 production release

- The complete local workspace was deployed through the guarded self-hosted
  production workflow. Backups `tdgpt-20260821-191755.dump` and
  `tdgpt-20260821-193110.dump` were created; all seven repository migrations
  are applied and `http://localhost:3000/login` passed health checks.
- The Netlify managed PostgreSQL database was backed up to
  `backups/netlify-20260821-192752.dump` before schema or catalog changes.
  Its pre-existing schema used legacy migration records (`001_init` and
  `008_sales_lifecycle`), so the verified baseline was recorded and the six
  missing repository migrations were applied with Prisma.
- Shopify catalog enrichment was applied fill-only: 318 matched products in
  Netlify production and 1,523 matched products in self-hosted production.
  Raw manufacturer/vendor values remain stored, but manufacturer is excluded
  from public filters and presentation.
- The homepage now calls Next.js 16 `connection()` before its live Signature
  Series query. This prevents build-time database access while retaining fresh
  runtime product details.
- Netlify project `titan-sales-portal` (`www.tdusales.com`) is connected to
  `brbequette/sales-portal` main, not this workspace's historical `origin`
  (`brbequette/TDGPT`). Production code promotion must target the connected
  repository or use an account authorized for manual production deploys.
- Release commit `de50819b1eb2e807db88f47b14caa7158c018f3e` was pushed as a
  fast-forward to the Netlify-linked `main` branch. Netlify deploy
  `6a890b031e3cdc000868a87e` was immediately skipped with `account credit usage
  exceeded`; the custom domain therefore continues serving prior code deploy
  `6a85eb5d75f02b00080bff6f` until the account's build credits are restored and
  the queued production commit is retried. The managed database changes are
  already live and backward-compatible with that prior code.
- Follow-up production build `6a8955d43974a12121ed53c0` completed on
  2026-08-22 and published deploy `6a8955d43974a12121ed53c2` from commit
  `077217d50bf019bb4c88f9870d0eb903d1ba3b5d`. Live checks returned HTTP 200
  for `/`, `/shop`, `/signature-series`, `/api/public/products`, and `/login`;
  Prisma reports all seven migrations current. `www.tdusales.com` is now on the
  refreshed storefront release.
- Contractor Flyer Studio accepts an image from the system clipboard anywhere
  on the page. A Print Screen followed by Ctrl+V reuses the authenticated
  product-screenshot vision route, sets the screenshot as the giveaway image,
  and fills visible product details for review. Text-only paste continues to
  behave normally.
- After AI artwork is generated, Flyer Studio displays a revision prompt and
  sends the current flyer back as the primary high-fidelity edit source. The
  revision route preserves supplied campaign facts and product references while
  applying the requested visual/layout edits.

## 2026-08-22 Flyer Studio and catalog cutout release

- Reference flyers are style guidance only. They are no longer composited into
  deterministic previews, and the artwork prompt expressly prohibits copying
  their pixels, products, people, logos, wording, offers, or backgrounds.
- Flyer Studio supplies the official light Titan horizontal logo as an exact
  image input. It now has separate pre-render creative-direction and post-render
  revision prompts; neither may override locked products, pricing, offer facts,
  logo, or rep contact data.
- Non-JSON gateway/function responses are decoded into useful flyer-generation
  errors instead of failing with a generic JSON parse exception.
- The 693 SKU image-map entries resolve to 381 unique catalog master images.
  All 381 now have generated 1200px transparent PNG cutouts under
  `public/product-images/cutouts/`; originals and annotated detail diagrams stay
  untouched. Flyer Studio bootstrap prefers the same SKU cutout map.
- The cutout library was verified with zero missing, opaque, or blank master
  images. `scripts/build_product_cutouts.py` is the reproducible batch tool.
- Weekly TV payloads now include each invoice/sales-order account owner ID and
  the TV board attributes documents by that stable rep ID before falling back
  to salesperson-name matching. This addresses rep rows with blank/zero values
  caused by name variants.
- Netlify production deploy `6a896ac9f1b8bb00086636f9` published commit
  `612df2a0db48c364fd8d70e33ef9298fb2ba09e5` at 2026-08-22 09:27 UTC. Live
  checks returned HTTP 200 for `/`, `/shop`, `/tv`, `/api/public/products`, and
  the authenticated Flyer Studio redirect. A live cutout was verified as
  1200x1200 RGBA with real transparent and opaque pixels.

## 2026-08-22 Benjamin Bequette production identity merge

- A fresh Netlify production database recovery snapshot was created and
  verified before the identity repair (`2026-08-22T10:02:17.519Z`).
- The three Benjamin/Ben Bequette user rows were audited through an
  administrator-only maintenance route. The Zoho-linked account
  `cmppahv5m0000lsi0s00jywp3` (`ben@titandiamond.net`) was selected as the
  canonical identity.
- Duplicate users `cmsruy9q90000mt5im0gdb91z` and
  `cmswgtear0000uuoqtog6jenw` were merged transactionally and deleted only
  after their relationships were moved. The canonical account now owns the
  additional 35 notes, 2 tasks, 5 notifications, and compensation plan. Its
  final audit reports one matching Benjamin account, 11,014 notes, 21 tasks,
  28 notifications, and one compensation plan.
- The duplicate time entry collided with an existing canonical entry on the
  same date; related change requests were preserved against the canonical day
  before the duplicate row was removed. Compound monthly-goal collisions are
  also guarded by the maintenance workflow.
- Netlify deploy `6a8972f7cff5180008fefee3` published the guarded maintenance
  workflow from production commit `e518183139a69530a99328238803136e1a658a45`.
- The requested all-time invoice cost and commission recalculation remains
  intentionally paused. No invoice cost-processing, commission-recalculation,
  or Zoho cost-sync endpoint was called during the identity repair.

## 2026-08-22 master-derived cutout Netlify release

- A verified Netlify database recovery backup was created before release at
  `backups/netlify-20260822-033731.dump` (33.77 MB). No migration, catalog data
  mutation, cost sync, or commission process was run.
- Scoped production commit `55160b1594ea383867ff3de693bfaa053bde2734`
  added the 358 approved master-derived transparent product cutouts, the guarded
  rebuild tool, updated image map, direct Signature paths, and larger storefront
  product presentation. Unrelated local `deno.lock` was excluded.
- Netlify deploy `6a897d317646130008917059` published successfully at
  2026-08-22 10:46 UTC with plugin status `success`. Live HTTP checks returned
  200 for `/`, `/shop`, `/signature-series`, `/api/public/products`, and
  `/login`. The CDN Dragon asset was verified as 1200×1200 RGBA with genuine
  transparent and opaque pixels, and desktop/mobile visual checks confirmed
  the blade fills its presentation area without a background.

## 2026-08-22 field-work hero and unified use-case release

- A verified production database backup was created before deployment at
  `backups/netlify-20260822-044854.dump` (33.77 MB). No database record,
  migration, cost, commission, or Zoho data was changed.
- Production commit `2d2c8c4508bcaa1c8ad18e711c045ad672e89da3` added 15 unique
  2048x1152 cinematic field-work hero scenes and assigned them across the public
  routes. The reproducible generator is `scripts/generate-public-hero-series.ps1`.
- Public product application and material presentation now resolves through one
  controlled `Cuts / Application` taxonomy. The API retains backward-compatible
  fields and does not rewrite the underlying raw application, material, or vendor
  data. Manufacturer remains stored but is not exposed as a public facet.
- Follow-up production commit `6bf342409fbd68fa277351b63f1c1f09ddbe1bfa`
  removed the last client-side legacy aliases (`Metal`, `Stone`, and `Masonry`)
  so only their controlled equivalents are presented.
- Netlify deploy `6a8990271f55de00089ff3fb` published successfully at
  2026-08-22 12:06 UTC. Live checks returned HTTP 200 for the public pages,
  generated hero assets, and product API. The production API returned 4,108
  products with `useCases`; live visual inspection confirmed the unified facet,
  controlled labels, product load, hero layering, and absence of legacy aliases.

## 2026-08-23 image-backed public catalog rule

- Public storefront feeds must return only products with a resolved, non-placeholder
  product image. Resolution prefers the maintained SKU image map, then a stored
  product image URL, then a valid image embedded in the legacy description.
- The storefront must not invent generic category or guessed SKU image paths for
  products lacking artwork. Internal/admin product records remain unchanged and
  continue to include image-less items for catalog cleanup.
- Homepage and Signature Series SKU/variant lists include only image-backed
  variants, preventing image-less product configurations from being advertised.

## 2026-08-23 Pioneer price-guide SKU image attachment

- The embedded product images in `Pioneer Titan Diamond PRICE GUIDE 2023 (2).xlsx`
  were reconciled to exact normalized Product SKUs. The duplicate `ORIGINAL QUOTE`
  reference tab and ambiguous candidates were excluded.
- A verified Netlify production database backup was created before mutation at
  `backups/netlify-20260823-172135.dump` (33.77 MB).
- 282 Product records were updated with SKU-matched `imageUrl` values referencing
  69 unique prepared assets; the guarded post-write audit verified all 282 values
  with zero mismatches. All 282 records previously had an empty `imageUrl`. The
  initial background-removal treatments and the white-canvas `studio-v3` set were
  rejected after checkerboard review. Database paths and the SKU image map now
  target `transparent-v4`: 69 AI-segmented, undistorted 1200×1200 RGBA PNGs with
  genuine transparent backgrounds. Five difficult reflective/white-on-white
  sources were rerun through the higher-fidelity BiRefNet model before approval.
  Experimental `cutouts`, `cutouts-v2`, and `studio-v3` are not approved for use.
- Prepared masters/cutouts live under
  `public/product-images/pioneer-price-guide/transparent-v4/`, and the same 282 SKU mappings were
  added to `src/lib/image-map.json`. These files are local and require a scoped
  application release before the new relative URLs are available on the Netlify
  storefront. Do not treat the database write alone as a completed asset deploy.
- Before release, production was backed up to
  `backups/netlify-20260823-170153.dump` (33.77 MB). No database rows or
  migrations were changed. Production commit
  `9feed3acb5780abb4d951ad768b110ff916cb609` published as Netlify deploy
  `6a8b8a281eecab000895b15a` on 2026-08-24 00:06 UTC.
- Live verification returned 456 public products, zero missing or placeholder
  image URLs, and 24/24 initially visible product canvases successfully rendered
  at 900x900. The prior public feed exposed 4,108 records.

## 2026-08-23 Zoho SSO navigation repair

- The unified employee/admin login must let NextAuth perform the Zoho OAuth
  redirect exactly once. NextAuth v4 does not support `redirect: false` for
  OAuth providers; combining it with a manual `window.location.assign` caused
  the visible reload/bounce before leaving the login page.
- Employee and administrator Zoho sign-in now use the standard single redirect
  and accept only relative, same-site callback paths. Production provider
  discovery confirms both sign-in and callback URLs use `www.tdusales.com`.
- Production backup `backups/netlify-20260823-171445.dump` (33.77 MB) was
  created before release. Commit `39e22c75f36c193b26cb899ddf9ae08d2be1a229`
  published as Netlify deploy `6a8b8d2e5d15680008ae6d80` at 2026-08-24
  00:18 UTC with no migrations. A live employee-login button test handed off
  directly to `accounts.zoho.com` once with the callback fixed to
  `https://www.tdusales.com/api/auth/callback/zoho`.

## 2026-08-23 PRODUCT DATA workbook comparison and image attachment

- `PRODUCT DATA.xlsx` was treated as source data only. It contains 1,664 product rows, 1,646 unique normalized SKUs, 1,617 image placements, and 196 unique embedded image assets.
- Exact case-insensitive SKU comparison (with `TDU-` prefix normalization) against the authoritative local Docker production database found 1,541 matched rows and 123 workbook rows without a database match. Four normalized SKUs are duplicated in the workbook.
- All 196 unique assets were extracted to `public/product-images/product-data/masters/` and processed into true-alpha PNGs under `public/product-images/product-data/transparent-v1/`. Automated alpha verification passed 196/196 files.
- Existing product artwork was preserved. Of 1,521 matched rows carrying workbook artwork, only SKU `SHM0406` lacked a usable database image. After backup `backups/tdgpt-20260823-180155.dump`, its guarded `Product.imageUrl` update was applied as `/product-images/product-data/transparent-v1/shm-69ea4ac9f1.png`; the live asset returned HTTP 200 after the app container restart.
- `src/lib/image-map.json` now includes the same `SHM0406` mapping. The reviewed comparison workbook is at `outputs/01a03115-8fc6-77c2-9899-b7cfb56f2014/Product Data Database Comparison.xlsx`. No price or cost conflicts were written to production.

## 2026-08-23 PRODUCT DATA circular blade reconstruction v4

- The initial `transparent-v1` PRODUCT DATA cutouts were rejected after circularity QA showed that background removal had deleted real blade segments and left surviving metal semi-transparent.
- The approved replacement set is `public/product-images/product-data/circular-v4/` (196 PNGs). Round-blade geometry is inferred from original-image evidence, restoration is limited to the outer blade annulus, every restored source pixel is made opaque, and known composites/ring diagrams are explicit pass-through exclusions. Intentional gullets, slots, and arbor holes remain transparent.
- Full validation found 196/196 nonblank RGBA files with genuine transparent pixels. The largest repairs were reviewed old-versus-new on checkerboards; the known damaged `SMXMP` blade now has a complete circular segment envelope.
- A fresh self-hosted production backup was created at `backups/tdgpt-20260823-192718.dump`. Only SKU `SHM0406` was switched from the rejected v1 path to `/product-images/product-data/circular-v4/shm-69ea4ac9f1.png` using an exact guarded update. The live asset returned HTTP 200 (`image/png`, 765,304 bytes) after the app-container restart.
- `src/lib/image-map.json` uses the same `SHM0406` circular-v4 path. The rejected `transparent-v1`, experimental `circular-v2`, and `circular-v3` directories must not be used for new mappings.

## 2026-08-24 communications automation foundation

- The sales communications automation plan from the Codex task `Plan sales communication automation` is the active design direction. Implementation remains development-only; no migration was applied and no production communication or deployment occurred.
- Migration `20260824120000_communications_automation_foundation` adds an append-only `CommunicationEvent` index for unified account timelines, reviewable `SalesCommitment` records, and `AutomationRecommendation` proposals with simulation, approval, rejection, and audit fields.
- Existing call, SMS, email, task, and campaign records remain authoritative. The new timeline is an index rather than a replacement, preventing destructive data consolidation.
- AI-discovered automations default to `DRAFT_ONLY`; no proposed rule may send a message, change authoritative customer data, or become automatic without an explicit review workflow.
- Prisma schema validation passes. Follow-up work must add authenticated timeline/recommendation APIs, idempotent missed-call and voicemail processors, structured transcript extraction, the approval inbox UI, and development migration/testing before any production decision.

## 2026-08-24 communications foundation production release

- The full current working tree passed the Next.js 16.2.6 production build, TypeScript validation, all 311 static pages, Prisma validation, and route generation after an explicit authentication return-type fix in the automation recommendation API.
- Mandatory backup `backups/tdgpt-20260824-052415.dump` (40.27 MB) was created before deployment. Migration `20260824120000_communications_automation_foundation` was applied successfully as the eighth self-hosted production migration.
- The guarded self-host deployment rebuilt both Docker images, restarted the application and Books sync worker, and passed health checks at `http://localhost:3000/login` (HTTP 200). Unauthenticated checks correctly returned HTTP 401 for the new timeline and automation recommendation APIs.
- The Docker build context was 4.85 GB and caused a very slow release. Narrowing the Docker context and existing dynamic admin-image filesystem traces remains a performance follow-up; the warnings did not prevent compilation or runtime health.

## 2026-08-24 communications automation workflow increment

- `src/lib/communication-automation.ts` now idempotently indexes Zoho Voice call records into the unified timeline. Missed inbound calls and voicemails create one high-priority callback task due in ten minutes plus a `DRAFT_ONLY` automation recommendation; no customer message is sent automatically.
- The Zoho Voice webhook calls the safe follow-up processor after its existing call-log upsert. Structured call analysis now extracts transcript-grounded outcomes, decision-maker status, products, equipment, applications, competitors, objections, buying intent, recommended channel/timing, commitments, and proposed account updates.
- AI findings are stored as timeline metadata. Commitments are created with `PROPOSED` status and account updates remain proposals; neither silently changes authoritative account data.
- Administrator route `/api/admin/communications/index-events` can idempotently index recent calls, SMS/MMS, and account-linked email records. `/admin/automation-opportunities` provides the human review inbox for approving drafts, pausing, or rejecting with a reason.
- `/sales/todays-calls` and `/api/sales/todays-calls` provide an ownership-filtered priority queue based on overdue tasks, promised next actions, call inactivity, reactivation timing, recent communication intelligence, and missing phone data.
- The full Next.js production build and TypeScript validation pass with 315 static pages. Existing broad admin-image filesystem trace warnings remain nonblocking.

## 2026-08-24 communications workflow production release

- Mandatory backup `backups/tdgpt-20260824-061251.dump` (40.28 MB) was created before deploying the call-indexing, missed-call workflow, structured call intelligence, automation inbox, and Today's Calls workspace. All eight migrations remained current; no additional database migration was needed.
- The guarded production workflow rebuilt both images, restarted the app and Books sync worker, and passed health checks. Live `/login` returned HTTP 200; the two protected pages redirected unauthenticated visitors (HTTP 307), and the Today's Calls API returned HTTP 401 without a session.
- The release sends no automatic customer messages. Missed-call SMS remains a draft action, AI commitments remain `PROPOSED`, and approved automation recommendations remain `DRAFT_ONLY` until a separate audited rule compiler is implemented.
- Existing historical communication events are not automatically bulk-indexed during deployment. An authenticated administrator must invoke `/api/admin/communications/index-events` in reviewed batches; new Zoho Voice webhook events index automatically.

## 2026-08-24 Zoho Voice provider correction

- Desktop phone links now try the installed ZDialer integration first and the official Zoho Voice browser WebSDK second. A call is reported as started only after one of those providers accepts it; otherwise the number is copied with an explicit fallback message.
- `/api/calls/make` no longer fabricates a manual call ID or claim that the server placed a call. It returns provider capability and normalized call configuration with `placed: false`.
- The optional browser key is `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY`. The production domain must also be allowlisted in Zoho Voice. This public WebSDK key is distinct from OAuth credentials and must not replace them.
- Without the WebSDK key or ZDialer browser integration, desktop calls intentionally fall back to copy-to-dial; mobile continues to use the native `tel:` handler. This limitation must not be represented as a verified provider call.

## 2026-08-24 Zoho Voice provider production release

- Mandatory backup `backups/tdgpt-20260824-064941.dump` (40.28 MB) was created before deployment. Both Docker images rebuilt successfully, all eight migrations remained current, and the application plus Books sync worker restarted successfully.
- Live health checks passed: `/login` returned HTTP 200 and protected Today's Calls and automation recommendation APIs returned HTTP 401 without a session. The app and PostgreSQL containers report healthy.
- `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY` is not currently configured in production. Therefore production desktop dialing currently requires the ZDialer browser integration and otherwise falls back to copying the number; native mobile `tel:` dialing remains available.
- No automatic customer message sends were enabled by this release.

## 2026-08-24 communications real-data integrity correction

- Communication UI and server paths must represent only confirmed provider/database facts. No synthetic IDs, optimistic outbound messages, simulated channel success, or click-only call timestamps are permitted.
- The primary SMS UI now calls `/api/send-sms` and adds an outbound message only after Zoho returns a non-empty, non-failure response and the server persists a real `SmsMessage` row. The UI uses that row's actual ID, body, and timestamp.
- Zoho SMS response checks normalize error/failed statuses and codes. Failed or empty provider responses do not create successful outbound message records.
- Contact notes now use `/api/add-note`; they no longer reuse the SMS action. Unconfigured email and WhatsApp actions return HTTP 501 and create no communication note. Legacy `INITIATE_CALL` returns a conflict and no longer mutates `lastCalledAt`.
- Historical indexing remains source-only and idempotent: it references existing `CallLog`, `SmsMessage`, and account-linked `Email` IDs. It does not seed or invent communication activity.
- The full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass before deployment.

## 2026-08-24 communications real-data production release

- Mandatory backup `backups/tdgpt-20260824-075750.dump` (40.28 MB) was created before deployment.
- The guarded release rebuilt both images, confirmed all eight migrations were current, restarted the app and Books sync worker, and passed the live `/login` health check.
- No provider test communication was sent. Verification was intentionally non-sending; the release prevents false success and synthetic activity but does not by itself prove external delivery without an authorized test recipient.
- Production communication records now require persisted source rows and, for new outbound SMS, an accepted non-failure Zoho response.

## 2026-08-24 final communications mock-path removal

- Non-SMS campaign sends and test sends now return HTTP 501 before creating blasts, notes, campaign success logs, or synthetic activity. The prior mock-success branches were removed.
- Campaign SMS test responses use normalized Zoho failure detection and require a non-empty provider response before reporting success.
- New `/api/calls/log` records require a real provider `zohoCallId`; the API no longer generates `zv_log_<timestamp>` identifiers. `lastCalledAt` updates only for completed outbound calls.
- Account Dialer no longer posts a click-only call log. Power Dialer now starts only through ZDialer or the official Zoho Voice WebSDK and pauses with an error if neither provider accepts the call.
- Full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass.

## 2026-08-24 final mock-removal production release

- Mandatory backup `backups/tdgpt-20260824-092519.dump` (40.28 MB) was created before deployment.
- Both production images rebuilt, all eight migrations remained current, the app and Books sync worker restarted, and `/login` passed live health verification.
- Deployment verification sent no communication and created no campaign, call, SMS, email, or WhatsApp activity.
- Real external delivery remains unverified until an explicitly authorized test recipient is supplied; the system must not infer delivery from a local success state.

## 2026-08-24 Zoho Mail and real-event indexing completion

- Production has configured `ZOHO_MAIL_ACCOUNT_ID`, `COMPANY_FROM_EMAIL`, and Zoho OAuth refresh credentials. Existing `EmailInbox` uses the real `/api/emails` Zoho Mail send path.
- Outbound email persistence now requires Zoho to return a real provider message ID. The prior `sent_<timestamp>` fallback was removed; a missing message ID produces an error and no outbound `Email` row.
- `/admin/automation-opportunities` now exposes an administrator-only `Index real records` action. It indexes up to 1,000 existing calls, SMS/MMS messages, and account-linked emails per run using their source database IDs and idempotent upserts.
- The indexing action reports exact source counts and never sends a communication or seeds synthetic activity.
- Full Next.js 16.2.6 production build, TypeScript validation, and all 315 generated pages pass.

## 2026-08-24 Zoho Mail and indexing production release

- Mandatory backup `backups/tdgpt-20260824-095118.dump` (40.28 MB) was created before deployment.
- Both images rebuilt, all eight migrations remained current, the application and Books sync worker restarted, and the live `/login` health check passed.
- Production now includes strict Zoho Mail provider message-ID persistence and the administrator-controlled real-record indexing action.
- Deployment verification sent no communication and did not execute historical indexing automatically.
- `NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY` remains unconfigured; desktop browser calling still requires ZDialer unless that public WebSDK key and domain allowlist are supplied.

## 2026-08-24 executive dashboard real-data repair

- The executive modal no longer depends on the generic dashboard payload whose empty state prevented the real rep-stat board from rendering.
- `ExecutiveRepStats` loads Today, This Week, MTD, and YTD concurrently from the existing authenticated `/api/get-rep-stats` service; it introduces no synthetic totals and does not duplicate accounting calculations.
- The view shows billed subtotal, dead profit, net profit after VIG, commissions, invoice counts, average invoices, margins, YTD uninvoiced sales-order pipeline, estimated pipeline commission, and a per-rep period leaderboard.
- Company and individual-rep scopes continue to use the executive modal's existing View As selector.
- Invoice totals retain existing business rules: void/draft documents are excluded, denormalized computed fields are preferred, legacy records use established fallbacks, and paid/upfront commission treatment is preserved.
- Full Next.js 16.2.6 production build, TypeScript validation, component lint, and all 315 generated pages pass before deployment.

## 2026-08-24 executive dashboard production release

- Mandatory backup `backups/tdgpt-20260824-101537.dump` (40.28 MB) was created before deployment.
- Both production images rebuilt, all eight migrations remained current, and the app plus Books sync worker restarted successfully.
- The live `/login` health check passed at `http://localhost:3000/login`.
- Production now serves the real-data executive period scorecard and rep leaderboard.

## 2026-08-24 product web-visibility controls

- `Product.showOnWeb` is the persistent public-catalog visibility flag and defaults to true for ordinary products.
- Migration `20260824170000_product_web_visibility` sets every existing gift product to `showOnWeb = false`; gift rows and accounting history are preserved, not deleted.
- The public products API requires both `giftItem = false` and `showOnWeb = true`.
- Administrators can toggle Show on web directly on every internal catalog row and in both product editors. Marking a product as a gift forces web visibility off.
- Zoho product reseeds preserve manually hidden ordinary products and force synchronized gift products off the web.
- Prisma validation, TypeScript validation, the full Next.js 16.2.6 production build, and all 315 generated pages pass before deployment.

## 2026-08-24 product web-visibility production release

- Mandatory backup `backups/tdgpt-20260824-110524.dump` (40.28 MB) was created before deployment.
- Migration `20260824170000_product_web_visibility` applied successfully as the ninth production migration.
- Both images rebuilt, the app and Books sync worker restarted, and the live `/login` health check passed.
- Read-only production verification returned zero rows where both `giftItem` and `showOnWeb` are true.

## 2026-08-24 sender-number refresh repair

- Production stores three configured Zoho sender-number records; the missing campaign option was caused by a 24-hour browser cache, not failed persistence.
- Campaign and message sender selectors now fetch the authenticated `zoho_phone_numbers` setting with `cache: no-store`; the campaign composer also refreshes numbers whenever it opens.
- The number-management response now emits `Cache-Control: no-store, max-age=0`, and saving numbers removes the legacy browser cache entry.
- Verification is non-sending: no SMS, MMS, campaign, or provider test was executed.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.

## 2026-08-24 sender-number refresh production release

- Mandatory backup `backups/tdgpt-20260824-112444.dump` (40.28 MB) was created before deployment.
- Both images rebuilt, all nine migrations remained current, the app and Books sync worker restarted, and `/login` passed its live health check.
- The saved admin form showed four sender numbers while the authoritative setting retained only three; this confirmed a prior persistence loss in addition to the stale browser cache.
- The confirmed fourth form record was restored directly to `zoho_phone_numbers` after the guarded backup, preserving the other entries and the selected default. Read-only verification now returns four records.
- Campaign/message sender selectors no longer use the 24-hour cache and the campaign composer refreshes the database-backed list whenever opened.
- No SMS, MMS, campaign, or provider test was sent.

## 2026-08-24 account duplicate visibility correction

- Production contains 7,935 accounts with unique Zoho IDs; 2,542 are excess rows sharing an exact case-insensitive account name, and 2,779 are excess when punctuation is normalized. These are source CRM records, not duplicate SQL join rows.
- The duplicates became visible when the sales screen began loading the full account set instead of a smaller leading slice.
- The sales account screen now groups exact same-name records after applying the active rep scope. It preserves a real source record as the canonical action target while combining contacts, products, sales, profit, unpaid, overdue, and recent-activity totals from every grouped record.
- No account, invoice, contact, message, task, or commission data was deleted or merged.
- The Zoho account sync no longer limits its existing-name comparison and post-sync account map to 500 records, preventing later records from bypassing the intended duplicate-name guard.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
- Existing source duplicates remain available in PostgreSQL and Zoho for a future audited CRM merge; the current correction is intentionally non-destructive.

## 2026-08-24 cross-page selection and campaign recovery

- The My Sales Pipeline header checkbox selects or clears every account in the current filtered result set across all client-side pages, rather than only the visible 50-row page.
- Campaign progress now recovers the signed-in author’s latest persisted `RUNNING` job when browser local storage lacks the job ID, restoring the global progress pill after reload and resuming from the saved `currentIndex`.
- Campaign status lookup and processing are owner-scoped; an authenticated user cannot recover or advance another author’s job by ID.
- The campaign composer now checks the manager’s returned success flag and does not show a false “started” toast when job creation is rejected.
- Production job `Free Gun Safe` was read-only verified as stalled at 118/2,113 recipients (102 sent, 16 failed), not restarted or duplicated during diagnosis. Recovery resumes at the persisted index after the author reloads the updated app.
- TypeScript and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.
- No campaign message was sent by diagnostic or deployment verification.

## 2026-08-24 select-all and campaign recovery production release

- Mandatory backup `backups/tdgpt-20260824-122702.dump` (40.49 MB) was created before deployment. Both images rebuilt, all nine migrations remained current, services restarted, and the live login health check passed.
- Deployment diagnostics sent no campaign message. The persisted `Free Gun Safe` job remains recoverable from its saved checkpoint when its author reloads the updated application.

## 2026-08-24 administrator campaign visibility and intro-offer readiness

- Strict administrators can recover and observe the latest company-wide `RUNNING` campaign, including its author, totals, sent/failed counts, and persisted progress after a reload.
- Campaign advancement remains single-owner: observer requests set `observeOnly=true`, so additional administrator browsers cannot race the author session and send duplicate recipient chunks.
- The intro-offer page uses repository-tracked product and official-brand images under `public/images`; neither `.gitignore` nor `.dockerignore` excludes these assets, and the production build traces them as static public files.
- The live self-hosted app currently has Zoho and Easyship configuration but no `AUTHORIZENET_API_LOGIN_ID`, `AUTHORIZENET_TRANSACTION_KEY`, or `AUTHORIZENET_PUBLIC_CLIENT_KEY`. Real card capture must remain disabled until all three production gateway values are supplied; the page must not claim that an order is paid meanwhile.
- TypeScript validation and the full Next.js 16.2.6 production build with all 315 generated pages pass before deployment.

## 2026-08-24 customer self-service account center

- The independent `/customer-portal` shell now includes a desktop and mobile `My Account` destination alongside dashboard, orders, blades, autoship, and tracking.
- Customer JWT account scope remains separate from employee/administrator NextAuth and internal application navigation.
- The account endpoint now returns the authenticated account's contacts and accepts a strictly account-scoped editable profile/address payload.
- Customer edits update the matching Zoho CRM Account and primary Contact first, then commit the same values locally in a Prisma transaction; a rejected Zoho update does not create a divergent local edit.
- Editable fields are limited to company name, primary contact name/email/phones, billing address, and shipping address. Sales quality, ownership, financials, commissions, and other internal fields are never exposed for editing.
- Existing customer order, invoice, autoship, purchased-blade, package, and tracking APIs remain account-filtered by the verified customer JWT.

## Zoho Voice campaign acknowledgement incident (2026-08-24)

- Production campaign `cmt7lst8c0001rutvnm7gnh2v` (Free Gun Safe) completed 2,113 recipients and locally recorded 1,900 successes / 243 failures from `+14325381379`, but Zoho Voice Logs did not show the campaign sends. The prior sender treated any HTTP 2xx response without exact lowercase `error` fields—including empty or non-confirming responses—as success, so those 1,900 records are not reliable proof of provider acceptance or delivery.
- All outbound SMS paths now use `netlify/functions/lib/zoho-sms-response.ts`. A send counts as accepted only when Zoho returns an explicit positive status/code or provider message ID; empty, malformed, ambiguous, HTTP-error, and explicit failure responses remain failures with a provider-facing reason.
- Do not automatically resend the affected campaign. Confirm actual Zoho delivery/log evidence first to avoid duplicate customer messages. Historical local message/log rows are preserved for audit and should be labeled unverified in a follow-up reconciliation rather than deleted.

## 2026-08-24 homepage Signature Series correction

- The public homepage previously rendered two consecutive Signature Blade showcases: the real-data 12-family carousel followed by a redundant static four-family teaser. The duplicate teaser was removed so the front page has one authoritative Signature section.
- Homepage Signature products now require `giftItem = false` and `showOnWeb = true`. Family inclusion uses real visible product rows while the verified tracked family artwork supplies the presentation image, so an empty legacy product image column does not hide Maximus or Gladiator.
- The Featured Signature link now opens `/signature-series` instead of the generic shop.
- Desktop cards use a consistent three-column grid without the prior uneven spans and gaps; tablet remains two columns and mobile retains horizontal snap scrolling.
- All 12 family artwork files returned HTTP 200 from production before the change. The full Next.js 16.2.6 production build, TypeScript validation, and all 316 generated pages pass after the correction.

## 2026-08-25 Netlify preview reconciliation

- Local Docker production remains healthy at `http://localhost:3000/`, and GitHub branch `codex/production-portal-updates` is clean at commit `6f17ff34`.
- Netlify production is still configured to build `brbequette/sales-portal` branch `main`; it has not been switched or overwritten.
- A new Netlify Linux branch preview built commit `6f17ff34` successfully as deploy `6a8d4cfbacc501000856cbee`. `/signature-series` and tested Signature blade assets return HTTP 200.
- The preview homepage returns HTTP 500 because Netlify's separate PostgreSQL database lacks migration `20260824170000_product_web_visibility`; server logs report PostgreSQL `42703` for missing `Product.showOnWeb`.
- Do not bypass `showOnWeb`, promote this preview, or silently migrate the Netlify production database. A controlled Netlify database backup/snapshot and migration plus an explicit production-branch decision are required before promotion.

## 2026-08-25 Netlify production reconciliation completion

- The user explicitly approved the Netlify application-database migration and production-branch switch.
- Netlify's managed database snapshot `snap-autumn-wildflower-aj4lqgpl` was created first, but inspection showed that connector contained only Netlify migration metadata and not the application's `Product` table. No application schema change was attempted against that unrelated database.
- Before altering the actual protected application database, a guarded one-time cloud build created rollback table `ProductWebVisibilityBackup_20260825`, copied every product ID and prior gift flag, added `Product.showOnWeb BOOLEAN NOT NULL DEFAULT true` only when absent, and hid all gift products. Verification required a non-empty backup and zero rows where both `giftItem` and `showOnWeb` were true.
- The one-time migration hook and script were removed after success. Clean Netlify preview deploy `6a8def7585b0e00009ae92f3` built commit `4912c13daf78faed2466a72b6ad7e58c83f81f82` and passed homepage, Signature Series, public product API, and image checks.
- Netlify production now builds `brbequette/sales-portal` branch `codex/production-portal-updates`. Production deploy `6a8df0f602d8fe78a266b586` published the same commit to `https://www.tdusales.com`.
- Live verification returned HTTP 200 for `/`, `/login`, `/intro-offer`, `/signature-series`, `/api/public/products`, both intro-offer blade images, the horizontal light logo, and representative Dragon and Gladiator Signature artwork.
- Local Docker production remains healthy and the database rollback table is intentionally retained until the web-visibility release has completed its operational observation period.
## 2026-08-25 Zoho SSO post-callback stabilization

- The self-host Zoho authorization request correctly generates `http://192.168.0.108:3000/api/auth/callback/zoho`; the registered callback origin was not the cause of the reload requirement.
- The failure occurred after provider return: NextAuth redirected immediately into the protected dashboard while the installed service worker also intercepted authentication navigation.
- Employee and unified Zoho login now return through public `/auth/complete`, which confirms the newly issued NextAuth session before performing a hard same-origin navigation to the validated relative destination.
- The service worker no longer intercepts `/api/auth/*` or `/auth/complete` navigations. Callback destinations remain restricted to relative, same-site paths.
- TypeScript validation and the full Next.js 16.2.6 production build with all 317 generated pages pass. Existing lint findings in the two legacy login pages predate this repair; the new completion page and proxy changes pass targeted lint.
- Guarded self-host deployment created backups `backups/tdgpt-20260825-131402.dump` and `backups/tdgpt-20260825-131444.dump` (34.25 MB each), rebuilt both images, confirmed all nine migrations current, restarted the app and Books sync worker, and passed the live login health check.
- Post-deploy verification returned HTTP 200 for `/auth/complete` and `/sw.js`; the live provider request retains the registered Zoho callback and stores `/auth/complete?callbackUrl=%2Fdashboard` as the NextAuth destination.
## 2026-08-25 development-only complete shipping cost rollup

- This change is explicitly limited to development and has not been deployed to self-host production, Netlify, or either production-linked GitHub branch.
- Actual shipping now aggregates distinct package/Easyship label charges and manual freight allocations, deduplicating matching tracking numbers and preserving any unexplained legacy amount as an itemized unallocated remainder.
- Invoice package lookup uses the linked sales-order ID/number rather than the invoice ID. Label purchases immediately refresh the linked sales-order and invoice `actualShippingCost` and `shippingCostBreakdown` fields and mark those documents for full cost recalculation.
- Actual shipping is an operational/invoice reporting value only: it is explicitly excluded from dead profit, net profit, margin, and commission calculations. Cost processing still persists the complete shipping total, breakdown, and source rollup metadata to both first-class columns and document JSON.
- Four focused shipping aggregation tests, TypeScript validation, and the full Next.js 16.2.6 build with all 317 pages pass.
- Development branch `codex/dev-shipping-cost-rollup` is running on port 3001. Docker is configured for a LAN-capable bind and `DEV_APP_URL`; Windows LAN forwarding for `192.168.0.108:3001` is configured separately from unchanged production port 3000. The branch remains local and unpushed.
## 2026-08-25 production local-AI recovery

- Titan AI failures were caused by the CPU-only `qwen3:4b` model exceeding the prior 20-second Ollama deadline while processing the tool schema; logs showed the request canceled during prompt evaluation rather than a database or HTTP outage.
- Production now uses the locally stored, tool-capable `llama3.2:3b` model with `OLLAMA_TIMEOUT_MS=180000` in `.env.selfhost`. A representative real-data prompt returned an explicit `query_company_summary` tool call in 33.4 seconds.
- The smaller `qwen3:1.7b` candidate was rejected after testing because it returned empty/non-tool responses and could not be trusted for financial questions.
- Production was restarted using the required `.env.selfhost` configuration. All nine migrations remain current; PostgreSQL and the app are healthy, and `/login` returns HTTP 200. No database records were changed by the recovery.
## 2026-08-25 executive rep-scope production correction

- The executive dashboard previously preferred the impersonated user's email as `repId`; `get-rep-stats` then compared that email to `Account.ownerId`, which stores the canonical local user ID. This prematurely returned zero rows for Ross Haisler and other selected users even when production data existed.
- The client now sends the canonical user ID. The API resolves ID/email/name requests to the canonical user and scopes candidate documents by either account ownership or exact stored salesperson attribution before applying its final rep matcher. This preserves salesperson-attributed invoices when account ownership differs.
- Read-only production verification found Ross Haisler has 220 qualifying 2026 salesperson-attributed invoices totaling $362,584.51 in subtotal; no data repair or document mutation was required.
- Guarded production deployment created backup `backups/tdgpt-20260825-150407.dump` (34.25 MB), built all 317 pages, confirmed all nine migrations current, restarted the app and Books sync worker, and passed the live `/login` health check.
## 2026-08-25 Netlify all-fixes production release

- Netlify site `titan-sales-portal` for `https://www.tdusales.com` is connected to `brbequette/sales-portal`, not the workspace's `brbequette/TDGPT` origin. Commit `12cc79691e6d9a76495cb50f1be9421dc9ff2f97` was fast-forwarded to the connected `codex/production-portal-updates` branch after explicit user confirmation.
- Netlify production deploy `6a8e15c85af9fd0008c1d1e6` completed in `ready` state with no reported error.
- Live verification returned HTTP 200 for `/`, `/login`, `/intro-offer`, `/signature-series`, `/api/public/products`, and representative tracked PNG assets. No new image files were pending in the released commit range; existing repository-tracked images remain available to Netlify.

## 2026-08-25 August production data reconciliation

- Mandatory pre-repair backup `backups/tdgpt-20260825-153731.dump` (34.25 MB) was created before production data changes.
- Live Zoho Books detail records were reconciled against PostgreSQL for all 41 invoices dated August 1–25, 2026. Thirty-two local issue/due date snapshots differed from Zoho and were repaired; seven true August 3 invoices had been stored under July dates, while invoice 10951 was corrected from a false August date to its authoritative June 26 issue date.
- A background full-detail refresh exposed a persistence defect that cleared `computedDeadCost` and `computedDeadProfit`. Thirty-eight August financial snapshots were restored from live Zoho custom fields. Final August verification reports zero missing dead cost, dead profit, net profit, salesperson, sync conflict, pending fetch, or pending cost flags.
- Corrected August totals are 41 invoices overall and 34 active invoices. Active subtotal is $69,734.65; dead cost $37,264.00; dead profit $31,220.17; net profit $27,327.32; and earned/eligible commission $10,273.18.
- Active rep totals: Ross Haisler 18 invoices / $36,571.63 subtotal; Montgomery Morgan 15 / $32,663.04; Benjamin Bequette 1 / $499.98.
- Canonical sync persistence now updates invoice issue/due dates from Zoho and carries dead cost, dead profit, and the correctly named VIG rate through `updateInvoiceRecord`, preventing subsequent detail refreshes from undoing the repair.
- TypeScript validation and the full Next.js 16.2.6 production build with all 317 generated pages pass. Existing broad image-tracing warnings are unchanged.
- Guarded self-host releases created deployment backups `backups/tdgpt-20260825-191352.dump` and `backups/tdgpt-20260825-193136.dump`; both deployments passed all nine migrations, app/worker startup, and localhost/LAN health checks.
- A forced live refresh of invoice 10970 verified the deployed path preserves Zoho issue/due dates, dead cost $78.94, dead profit $121.05, net profit $97.37, and VIG 1.3 with no conflict or pending flags.
- GitHub commit `6e54b2db264a80c0ae83ed45390526cca397af2a` is published to both project repositories. Netlify production deploy `6a8e53c95203d200084e531c` reached `ready` and `https://www.tdusales.com/login` returned HTTP 200.

## 2026-08-28 document status sync and order processing workspace

- Estimate webhook and daily Books synchronization no longer discard draft, sent, accepted, or declined estimates; all estimate statuses now update the local Quote row, while existing conflict detection remains in force.
- The Sales Documents status filter is populated from the actual statuses stored for invoices, estimates, and sales orders instead of a hard-coded cross-document list.
- New authenticated `/processing` workspace groups operational work by stage and supports inline estimate approval, sales-order confirmation, draft-invoice sending, payment recording, and shipment completion with tracking.
- The processing workspace uses the existing document ownership/admin authorization, conflict guard, Zoho Books payment/status endpoints, and local post-action status updates. It is linked from the primary application navigation.
- TypeScript validation and the full Next.js 16.2.6 production build pass with 318 generated pages. Existing broad image-tracing build warnings are unchanged.
- This work is source-only and has not been deployed to local production or Netlify. No Zoho status, payment, shipment, or production data was changed during verification.

## 2026-08-28 processing workspace production release

- Mandatory backup `backups/tdgpt-20260828-110030.dump` (34.26 MB) was created before deployment.
- The self-host production images rebuilt successfully, all nine migrations remained current, the app and Books sync worker restarted, and `/login` passed the guarded health check.
- Live self-host verification returned HTTP 200 for `/processing`; the production build includes the generated processing route.
- No payment, approval, invoice-send, or shipment action was executed during deployment verification.- GitHub commit `c873e133a735d071e09e8dbb7d6d27e6b8ee3585` was pushed to `brbequette/TDGPT` and `brbequette/sales-portal`, including both production branches.
- Netlify production deploy `6a91cfc2e0dbec0008b3c110` reached `ready` for the same commit. Live `/login`, `/processing`, and `/docs` checks returned HTTP 200.

## 2026-08-28 processing center operations-workbench correction

- Replaced the initial processing list with an order-centric operations workbench: stage lanes and a prioritized queue remain visible on the left while the selected order stays open in a persistent command center on the right.
- The command center follows the authoritative lifecycle from accepted estimate through sales-order confirmation, package preparation, tracked shipment, draft invoice, invoice send, external payment recording, and the three-part closeout checklist. Linked packages, invoices, payments, blockers, ownership, balances, profit, and next required action are shown together.
- Queue staging uses actual linked lifecycle/status data and elevates sync conflicts or incomplete cost processing into an exception lane. Payment copy explicitly records externally received funds; it does not imply that the portal charges a card.
- Document conversion now enforces the same account-owner/admin authorization and Zoho sync-conflict guard used by other document writes. Shipment completion requires tracking and updates linked Zoho/local package tracking, carrier, and shipped status as well as the sales order.
- Docker builds now exclude verified local-only AI/work folders so deployment context does not include unrelated model caches.
- TypeScript validation, focused processing-page lint, and the full Next.js 16.2.6 production build pass with all 318 generated pages. Existing broad image-tracing warnings are unchanged.
- Mandatory release backups include `backups/tdgpt-20260828-113315.dump`, `backups/tdgpt-20260828-113432.dump`, `backups/tdgpt-20260828-114047.dump`, and final pre-release backup `backups/tdgpt-20260828-114114.dump` (34.27 MB). Two guarded attempts stopped before deployment due build-context/WSL readiness checks; no backup guard was bypassed.
- The successful image build found all nine migrations current. A transient Docker container-removal race during restart was resolved by rerunning the standard start script; the app and Books sync worker are healthy and live `/login` and `/processing` checks return HTTP 200.
- No estimate approval, conversion, shipment, invoice send, payment, or closeout action was executed during release verification.
## 2026-08-28 admin-only sales-order processing boundary

- The Order Processing Center is restricted to strict administrators at both the page route and pipeline API; manager, collections, sales representative, and viewer roles cannot open it or load its queue.
- The workspace begins only after an estimate has been converted to a sales order. Estimates and estimate acceptance/conversion actions are excluded, and downstream invoice work is limited to invoices linked to a sales order.
- Order Processing navigation is hidden from non-administrators on desktop and mobile. Existing estimate tools elsewhere in the portal are unchanged.
- The screen is not a Collections workflow: sent invoices leave the queue, and payment recording, overdue follow-up, and closeout remain on the separate Collections screen.
- The combined release attempt was stopped during image build before migration or restart when this requirement changed. Its mandatory backup `backups/tdgpt-20260828-115158.dump` (34.27 MB) is retained; the corrected release is pending validation and deployment.
## 2026-08-28 TV daily rep subtotal and dead-profit cards

- Every Monday-Friday cell for every displayed representative now shows two explicit values in the same box: SUBTOTAL and DEAD PROFIT.
- The values continue to come from the authoritative weekly dashboard payload, which uses stored computed dead profit and the existing custom-field extractor fallback; no financial formula changed.
- Pending cost processing is displayed as a separate warning and no longer replaces or hides the dead-profit value.
- Focused lint passes with only the existing logo image warning, and TypeScript validation passes. This change is source-only until deployed.
## 2026-08-28 collections manager queue authorization

- The company Collections Manager is assigned through the `collections_manager_id` system setting; this does not change the user's general sales role.
- The Collections endpoint recognizes the assignment and grants the selected manager the company-wide overdue-invoice queue while ordinary sales representatives remain restricted to accounts they own.
- Brian Basiliere's public assignment was verified against his local user ID. No invoice, account, user, payment, or collections data was changed.
## 2026-08-28 order processing workstation and calendar-date correction

- The admin-only Order Processing screen is an order workstation: selecting a queue item keeps the order open and shows its line items, SKUs, quantities, rates, totals, customer contact, billing and shipping addresses, reference number, blockers, financial snapshot, linked packages/invoices, and the valid fulfillment/billing actions in one view.
- Processing still begins only with sales orders; estimates and Collections work remain outside this screen.
- Zoho document dates are treated as calendar dates in the workstation rather than UTC instants, preventing Arizona formatting from displaying the previous day.
- The linked-document invoice date tool now uses inclusive UTC calendar-day boundaries, so rows stored at midnight or noon remain inside the selected range. Applied invoice dates continue to use noon UTC and do not alter Zoho source-document dates.
- TypeScript, focused lint, and the full Next.js production build with all 318 pages pass. Guarded self-host deployment created backup `backups/tdgpt-20260828-121704.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and passed live `/login` and `/processing` health checks. Commit `f95fffd9` was published to the `codex/production-portal-updates` branch in both production repositories; public `https://www.tdusales.com/login` and `/processing` returned HTTP 200 after publication.
## 2026-08-28 Brian Basiliere Collections production correction

- Local production contained 80 eligible open collection invoices, but `collections_manager_id` pointed to a different user ID. Mandatory pre-change backup `backups/tdgpt-20260828-122951.dump` (34.27 MB) was created, then the single setting was corrected to Brian Basiliere's verified user ID `cmrjk9kyu0000w9cy2nsbfuyc`.
- The Collections response now declares company-wide scope, and the client uses a versioned cache that stores both invoice data and that permission. This removes Brian's stale empty cache and enables the sales-representative filter for the assigned Collections Manager without granting a broader application role.
- No invoice, account, payment, or user record was changed. TypeScript validation and the full 318-page production build pass; existing broad lint debt in the legacy Collections files is unchanged. Guarded deployment created backup `backups/tdgpt-20260828-123453.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and returned HTTP 200 for `/login` and `/collections`.
## 2026-08-28 Processing document-number correction

- The Processing queue now reads the canonical stored `invoiceNumber` / `salesOrderNumber` values before snake-case fallbacks and never substitutes the Zoho record ID when a real document number exists.
- Queue cards and the selected-order header display the actual document value without an artificial `#` prefix. Live verification identified sales orders `46357` and `46529` behind the previously displayed internal IDs.
- TypeScript, focused Processing-page lint, and the full 318-page production build pass. Guarded deployment created backup `backups/tdgpt-20260828-124915.dump` (34.27 MB), found all nine migrations current, restarted the app and Books worker, and returned HTTP 200 for `/processing`.

## 2026-08-28 Microsoft 365 email operational-intelligence foundation

- A read-only, approval-gated Microsoft 365 email ingestion foundation is implemented in source. It reads Inbox and Sent Items through Microsoft Graph application permission `Mail.Read`; `Mail.Send` is not required and secret values remain server environment variables only.
- The new `EmailAttachment` and `EmailOperationalEvent` models retain attachment metadata/classification, deterministic extraction results, source fingerprints, match confidence, conflicts, proposed/applied audit data, and administrator review state. Existing `Email` rows remain compatible while provider-neutral Microsoft message identifiers and mailbox metadata are added.
- Deterministic extraction currently recognizes shipment confirmations, freight bookings and charge components, payment-receipt evidence, customer-contact failures, returns, supplier approval/cancellation events, tariff notices, missing tracking, and address-change requests. Email payment evidence is never treated as authoritative payment confirmation.
- Events match local invoices, sales orders, purchase orders, and packages by their operational identifiers. Every event defaults to `REVIEW_REQUIRED`; approval records a decision only and does not yet mutate any business record. Address changes, cancellations, payments, credits, returns, and ambiguous matches must remain human-reviewed.
- Admin workspace `/admin/email-intelligence` shows connection readiness, the required business/setup checklist, event counts, match/conflict evidence, and approve/reject/reopen controls. `/admin/data-integrations` links to it.
- Microsoft tenant variables required before connection are `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET`. Required operational decisions are documented in `docs/EMAIL_INTELLIGENCE_SETUP.md`.
- The email add-on is optional per rep and is managed in User Settings. A rep can self-enroll only the mailbox matching their portal email; administrators retain oversight and must assign additional/shared mailboxes so tenant-wide Graph access cannot be abused to claim another employee's inbox.
- Deployed successfully to local Docker production on 2026-08-28. Migration `20260828210000_email_operational_intelligence` applied, the app and Books sync worker restarted healthy, and `http://localhost:3000/login` passed the deployment health check. Pre-deployment backup: `backups/tdgpt-20260828-133703.dump` (34.28 MB).
- The foundation now supports administrator-managed individual and shared mailboxes. Each mailbox can be assigned to one portal user (and users may have multiple mailboxes), independently enable Inbox/Sent Items, set a history window, enable/disable automatic sync, and retain its own last-sync status/error. One tenant-level Graph application serves the configured mailbox list; no user passwords are stored. `MICROSOFT_MAILBOX_ADDRESS` is now only an optional single-mailbox fallback.
- Prisma validation, generated-client TypeScript validation, focused lint, five extraction fixture tests, and the full Next.js production build pass. The setup screen now includes a specific “Where to get it” source and direct portal link for every required Microsoft, mailbox, sender, identifier, policy, and approval item.
- The setup-guidance update was deployed successfully to local Docker production on 2026-08-28. Mandatory backup `backups/tdgpt-20260828-134814.dump` (34.29 MB) was created; all ten migrations were current, the app and Books worker restarted healthy, and the live LAN `/admin/email-intelligence` page was verified to show all eleven guidance cards and seven source links.

## 2026-08-28 Signature blade Zoho description correction

- Root cause: the one-time product-attribute sync included generated Shopify/catalog text in the same Zoho item PUT as custom fields. Seventeen of the 32 Signature blade SKUs were updated successfully by that run, replacing their established Zoho descriptions.
- A read-only live audit compared each current description with both the recorded accidental payload and the pre-change rollback snapshot. All 17 were exact accidental matches, with zero later edits or read conflicts.
- Mandatory backup `backups/tdgpt-20260828-143341.dump` (34.29 MB) was created before correction. All 17 Zoho descriptions were restored to their recorded pre-change values; a second live audit reported 17 already-original, zero pending, zero conflicts, and zero failures.
- Existing Zoho item descriptions are now immutable in both the administrator catalog-import integration and the standalone product-attribute sync. Those paths may update custom fields, but only a newly created Zoho item may receive a generated starting description. The guarded repair utility and before/after audit artifacts are retained under `scripts/restore-signature-zoho-descriptions.mjs` and `outputs/zoho-description-repair/`.
- The prevention guards were deployed to local Docker production on 2026-08-28 after backup `backups/tdgpt-20260828-143532.dump` (34.29 MB). All ten migrations were current; the app and Books worker restarted successfully and the production `/login` health check passed.
## 2026-08-28 cross-environment Brian Collections identity

- The user explicitly approved `brian@titandiamond.net` as the exact cross-environment Collections Manager identity because local and Netlify databases can assign different internal user IDs.
- Collections authorization still honors the configurable `collections_manager_id` first; the verified Brian email is an additional exact match granting company-wide Collections data only, not administrator access or unrelated permissions.
- This correction is live on the public Netlify portal, where the local database ID assignment cannot be assumed to match. Production deploy `6a91edac638a36000877f1e8` published commit `fbc622fb8b2f86047b57bc81a86a1d3f5dc195c2` in `ready` state; public `/collections` returned HTTP 200. No invoice, payment, account, or user record was changed.
## 2026-08-28 Collections cache-shape crash correction

- Brian's public Collections page error `c.forEach is not a function` was caused by the client writing a structured cache object but reading it as an invoice array.
- The cache reader now validates and supports both legacy arrays and structured cache payloads, restores the manager-scope flag only from a valid object, and uses the `collections-v4` namespace so existing malformed session data is bypassed immediately.
- TypeScript validation passes. Netlify production deploy `6a91f49a418757000837b8dd` published commit `75e574c78e2a67a91e723e03e3150c04326d4b9f` in `ready` state, and public `/collections` returned HTTP 200. No Collections or customer data was changed.
## 2026-08-28 Collections route forced-scope correction

- Brian's company-wide authorization was working inside `get-collections`, but the Next.js route adapter forcibly injected Brian's own user ID as `repId`; the manager-aware endpoint then treated that as an explicit rep filter and returned his zero owned-account invoices.
- `/api/get-collections` no longer forces representative scope at the adapter. The endpoint remains authenticated and is solely responsible for applying admin, exact Collections Manager, or ordinary owner scope.
- The browser cache namespace advanced to `collections-v5` so Brian's previously cached empty authorized response is bypassed immediately. TypeScript validation passes. Netlify production deploy `6a91f9c665fa6500084ec297` published commit `c0c6a8de53afb148e4aae2fc0b807e3ab0a99972` in `ready` state, and public `/collections` returned HTTP 200.

## 2026-08-28 development-only operational-flow and dual-screen foundation

- This work is limited to the isolated development environment on port 3001. It has not been deployed to self-host production, Netlify, or either production-linked branch, and verification performed no Zoho, payment, shipment, or customer-data writes.
- The operational foundation adds durable idempotent action receipts, event history, work reservation and assignment, integration telemetry and exception quarantine, structured task outcomes, shared shipping presets, evidence-backed closeout checks, scorecards, and an administrator operations workbench. A scheduled source function can generate follow-up tasks for stale sales orders, missing tracking, and failed operations; reviewed retry state does not imply an autonomous external write.
- Zoho synchronization now records per-integration health, quarantines unmatched financial records instead of linking by customer name alone, batches field-level conflict merges into one update, and exposes pending per-record sync state in Processing. Existing targeted Zoho endpoint and conflict rules remain in force.
- A lightweight `/display` shell now mirrors the controller's current application route instead of presenting a separate preset dashboard. The shell can initialize before authentication so it can establish its same-origin channel, but it contains no business data; the mirrored workspace iframe remains protected by the normal route authentication. The mirrored route receives `display=1`, which removes the normal application shell and uses the full second screen for the same workspace and underlying information at an expanded width. `DualScreenController` in the primary top bar launches or reopens that window and follows controller route/query changes through the same-origin `BroadcastChannel` API.
- Dual-screen messages include unique source/message IDs and monotonic controller sequence numbers; each window ignores its own or previously seen messages to prevent feedback loops. Heartbeats detect disconnects, `beforeunload` announces display closure, a newly opened/reconnected display requests the current state, and a direct link plus explanatory notice handles blocked pop-ups. Full-screen entry remains an explicit user gesture because browsers require it.
- Same-computer, same-browser-origin windows are required for `BroadcastChannel`; separate devices or browsers do not synchronize. The second display's embedded workspace shares the normal authenticated browser session and cannot expose protected records without it. This is an outstanding product boundary rather than a cross-device signaling service.
- Prisma and TypeScript validation, focused lint for the dual-screen files, and the full Next.js 16.2.6 build pass with 331 generated pages. Existing broad image-tracing build warnings are unchanged. The development Docker stack rebuilt successfully and `/login` returns HTTP 200 on port 3001; production remains on port 3000.
- Browser QA uses the pre-existing E2E bypass only when `NODE_ENV=development`, the request host is localhost, and the request explicitly supplies the bypass query/header/cookie. `compose.dev.yaml` enables that guarded path so protected workflows can be tested without changing or exposing production authentication; LAN-host requests cannot use it. `AuthWrapper` now honors an already-approved bypass without waiting indefinitely for NextAuth initialization.
- Two-context browser verification on localhost:3001 confirmed the controller/display heartbeat, the iframe-based expanded workspace, removal of sidebar and duplicate display controls, and automatic mirroring of `/processing` with the same live four-order Processing dataset. Controller sequence tracking is scoped by controller identity so a refreshed/reconnected controller can safely restart its sequence without updates being discarded. The scripted browser blocks pop-up creation, so the direct-link fallback was exercised; normal `window.open` behavior remains covered by the implemented blocked-pop-up detection and manual browser testing boundary.
- The display-query gate is isolated above `AppShell`, and all `AppShell` hooks execute before its public-route return. This prevents React hook-order failures when a browser moves between normal and expanded routes; live browser re-verification showed the standard Dashboard with no error overlay.
- Each display is paired to the controller that launched it by a controller identifier carried in the display URL and heartbeat messages. Other open Titan tabs ignore that display, preventing multiple controllers from racing or showing a false connection; the controller identifier survives an ordinary controller refresh within its tab.
- Task-outcome reads now enforce the same owner/administrator/manager boundary as writes. Outcome types and follow-up dates are validated before persistence. Work assignment changes and integration-exception resolutions are written atomically with timeline audit events; invalid priorities/dates, missing exceptions, and repeat exception decisions return explicit errors.
- The persistent development dependency volume initially retained an older generated Prisma client after the schema migration. Prisma Client was regenerated inside the dev app volume and the app restarted; operational timeline models are now available at runtime. Port 3001 returned HTTP 200 after restart and production remained untouched.
- Development authentication now uses a hydration-stable browser-state check, eliminating the server/client credential-screen mismatch during localhost bypass QA. Next.js `allowedDevOrigins` includes the office development host `192.168.0.108`, allowing development assets and hot reload on the LAN address without changing production CORS or authentication rules.
- Final two-window QA on port 3001 paired a controller-specific direct display URL, reported `CONTROLLER CONNECTED`, mirrored `/processing?bypass=true` as `/processing?bypass=true&display=1`, rendered the same four live processing orders without the application sidebar or duplicate display controls, and then followed controller navigation to `/dashboard?bypass=true&display=1`. Both windows reported no browser console errors. The automated browser blocked `window.open`, confirming that the visible controller-specific direct-link fallback remains usable.
- The display URL formatter is server-pre-render safe and the final Next.js 16.2.6 production-style build passes all 331 generated pages. The pre-existing broad image file-tracing warnings remain unchanged. Final health checks returned HTTP 200 on development port 3001 and unchanged local production port 3000.

## 2026-08-28 development-only account communications second display

- This extension remains limited to development port 3001. Normal single-screen account behavior is unchanged: `/account` still provides its existing Overview, Comm Center, and Quick Sale experience. No production deployment or external communication was performed.
- When the synchronized route is an account and receives `display=1`, screen 2 becomes an account-specific communications and sales workspace. It retains the controller's account ID/query, displays the selected account and primary contact, and exposes the existing full Communication Center with calling, Zoho Voice SMS, email workspace/history, scripts, fact finding, product intelligence, AI copy support, and in-context order creation.
- Screen 2 adds account-context tabs for Campaign Builder, Flyer Studio, and a print-ready postal-letter composer. Campaign and Flyer Studio reuse the established admin routes inside the workspace; display mode removes redundant application/admin navigation to maximize working area. Campaign templates now support SMS/MMS, email, postal, and voice content types, while provider enforcement remains authoritative at send time.
- The postal tool uses the account billing address and creates a local print-ready letter only. Physical mailing/postage requires a future mail-vendor integration or manual fulfillment. Email and WhatsApp must not claim delivery unless their providers are configured; the existing Microsoft Graph foundation is read-only and is not expanded to `Mail.Send` by this work.
- Development query authentication was made hydration- and pre-render-safe with browser-state subscriptions. TypeScript and focused lint pass, and the full Next.js 16.2.6 build passes all 331 pages. Existing broad image file-tracing warnings remain unchanged.
- Screen 2 also includes a unified, account-authorized communication timeline backed by local `CommunicationEvent` rows. It presents up to 250 indexed calls, messages, emails, notes, directions, contacts, actors, and timestamps without making live provider calls. An empty state is explicit when historical events have not yet been indexed.
- Communication writes now normalize the selected account to its local ID in the screen-2 workspace, and the Zoho Voice SMS handler defensively resolves either local or Zoho account IDs before applying ownership checks. This closes a case where a correctly displayed Zoho-linked account could fail at send time because the endpoint expected only the local primary key.
- Zoho Mail sends now forward the composer's CC recipients and persist them with the outbound email record. New emails and AI-suggested replies require an explicit final recipient confirmation in the UI. Campaign-template creation validates required copy, supported channels, and HTTPS/embedded artwork before persistence. No live email or SMS was sent during verification.
- Saved Campaign Builder and Flyer Studio copy can now be loaded directly from the selected account's Communication Center. Merge fields are resolved for that account and the template opens in the appropriate SMS composer, email composer, phone script, or postal-letter workspace. Saved artwork remains attached to the campaign record; the current direct SMS path loads copy only and does not claim MMS delivery.
- Direct SMS now requires a final confirmation showing the selected contact and destination number before the provider request begins. This account-execution extension passes TypeScript and the full 331-page Next.js 16.2.6 build; legacy broad lint debt and the eleven existing image tracing warnings remain unchanged.
- TypeScript, focused workspace lint, and the complete Next.js 16.2.6 build pass with all 331 pages. Existing broad image file-tracing warnings remain unchanged.
- Read-only saved campaign templates are now available through an authenticated non-admin endpoint so sales representatives can load approved copy while administrator-only creation and deletion remain protected. Both the account Communication Center and the established Sales page use this read path.
- Provider-confirmed outbound Zoho Voice SMS and Zoho Mail email records now create matching account communication events in the same database transaction as their local provider record. Manual sales-call outcomes also create timeline events atomically with their note and account update, so the second-screen unified history no longer depends on a later indexing pass for new activity.
- The legacy provider call-log route now resolves local or Zoho account identifiers, enforces owner/manager/administrator access for both creation and edits, requires a local author identity, and atomically creates the call log, timeline event, and completed-call account timestamp. This closes a prior cross-account edit authorization gap.
- This additional development-only tranche passes focused route lint, TypeScript, and the complete Next.js 16.2.6 build with 332 pages. The same eleven pre-existing image tracing warnings remain; no communication or external provider write was performed during verification.
- Unified account history now reads both indexed `CommunicationEvent` rows and pre-existing account Notes, SMS messages, Emails, and provider CallLogs. Results are normalized, chronologically merged, source-deduplicated, owner-authorized, and paginated without rewriting historical rows or calling an external provider.
- The second-screen history workspace now shows channel counts and supports sticky full-text search plus channel filtering across subjects, summaries, contacts, representatives, directions, and event types. Empty-history and no-filter-match states are distinct.
- This historical-read extension passes focused API/component lint, TypeScript, and the full 332-page Next.js 16.2.6 build. The eleven existing broad image tracing warnings remain unchanged.
- Screen 2 now includes an additive `Account 360` workspace built from the already-authorized account-detail payload. It keeps invoiced revenue, stored invoice balance, open sales orders, and active follow-ups separate; lists recent invoices/orders/quotes with true document numbers and calendar-safe dates; and exposes all contacts and upcoming tasks without double-counting converted documents.
- Preservation of the original single-screen system is a release gate. Browser QA confirmed the normal account page still has its full application shell plus Overview, Comm Center, Quick Sale, call, SMS, task, Books, contacts, analytics, transaction history, fulfillment, product-purchase, and task surfaces. The dual-screen account workspace retains Communications & Sales, Account 360, Unified History, Campaign Builder, Flyer Studio, and Postal Letter. Neither page reported browser console errors.
- Regression validation passed the full 332-page build, TypeScript, focused lint, and all 26 repository tests covering existing UI, shipping costs, Flyer Studio, catalog imports, and email operational intelligence. Development smoke checks returned HTTP 200 for Dashboard, Account, Sales, Tasks, Shipping, Processing, and Messages; development port 3001 and unchanged production port 3000 remained healthy. No provider or customer write was performed.
- Contact-level execution is now available in the development-only second-screen workspace. Account 360 exposes every contact and can hand a selected contact into Communications & Sales; the communication header, postal recipient, SMS, calling context, and email composer follow that selection while the primary contact remains the default. Existing single-screen behavior is unchanged when no contact selection is supplied.
- SMS and email endpoints validate that an explicitly selected contact belongs to the authorized account before any provider call. Email records and communication events retain the validated contact ID, preventing an accepted provider send from later failing local persistence because of an invalid cross-account contact reference.
- Contact-level execution passes TypeScript, focused workspace lint, all 26 repository tests, and the complete Next.js 16.2.6 build with 332 pages. The existing image-tracing warnings remain unchanged, and validation performed no external communication or customer-data write.

## 2026-08-29 development-only representative sales execution workspace

- `/sales/todays-calls` is now the representative Sales Execution Workspace rather than a passive call-card list. It retains the existing owner-authorized ranking endpoint and adds one focused workday surface with urgent, callable, research, and open-action counts; queue search/filtering; an explicit next-account control; and direct paths back to the full pipeline and the established 50-lead cold-call workstation.
- Selecting a ranked account loads the existing account communications and sales workspace beside the queue. Representatives retain contact selection, call logging, SMS/email tools, scripts, fact finding, product intelligence, order creation, Account 360, unified history, campaign content, Flyer Studio, and postal preparation without duplicating those functions in a new implementation.
- In dual-screen mode, the controller retains the prioritized queue while the synchronized display query renders only the selected account's expanded communications and selling workspace. Account selection is written into the route query so the existing controller/display synchronization follows it. Single-screen use remains fully functional through the queue-and-workspace split view.
- The Sales Pipeline header links directly to the execution workspace. Existing `/sales`, `/sales/leads-calling`, account, task, document, communication, and processing routes remain available and unchanged.
- This initial consolidation is read-oriented and does not yet replace the backend scoring rules with the newly approved lead/account ownership, cadence, or sub-1.7 approval policies. Those remain staged business requirements. TypeScript, focused workspace lint, all 19 currently discovered repository tests, and the complete 332-page Next.js 16.2.6 build pass. The eleven existing broad image-tracing warnings remain unchanged; no provider or customer write was performed.

## 2026-08-29 Signature Series legendary hero

- `/signature-series` now has a dedicated full-bleed cinematic hero rather than relying on the faint route-wide atmosphere. The final 2048×1152 asset is `public/images/hero/field-series/signature-series-legendary-v2.jpg` and was generated in approved Image API edit mode with `gpt-image-2`, using the existing field photograph for realism and the Dragon, Zeus, and Medusa blade cutouts as exact product references.
- The composition keeps the active concrete cutter and live demolition cut on the right, works the specialized blade identities into the left-side jobsite structure, and preserves a deliberately dark central text-safe field. Layered responsive shading, text shadows, a restrained 18-second cinematic drift, mobile-specific positioning, and reduced-motion handling preserve readability and accessibility.
- TypeScript and the complete Next.js 16.2.6 production build pass with all 332 pages. The eleven existing broad image-tracing warnings are unchanged. Mandatory pre-deploy Netlify database backup `backups/netlify-20260829-141132.dump` (34.06 MB) was created; this visual-only release includes no schema or data mutation.

## 2026-08-29 development-only dual-screen call coaching and script center

- This tranche remains isolated to development port 3001. No production deployment, provider call, customer message, account mutation, or Zoho write was performed. Production port 3000 remains unchanged.
- `/sales/todays-calls` now has distinct single- and dual-screen roles. With no display connected, the complete responsive call coach appears beside/below the ranked queue. With screen 2 connected, screen 1 collapses to queue control, dialing, required action, account-tool access, and next-customer progression; screen 2 uses the full workspace for the customer-specific approved script, discovery prompts, account intelligence, and conflict/objection responses. The duplicated account communications workspace is no longer embedded in both places.
- A persistent `Get to Work` control starts the focused workday experience without removing ordinary login, clock, browsing, pipeline, account, communication, order, task, or admin routes. Closing or losing screen 2 restores the complete single-screen coach automatically through the existing heartbeat status.
- `CallScript` now stores department, scenario, objective, discovery prompts, objection/response pairs, closing prompt, and priority. `/admin/scripts` is the authoritative Call Scripting Center for Sales, Collections, Support, and Shipping. Four editable starter scripts provide a useful development baseline; administrators can activate, revise, prioritize, or replace them. Existing scripts remain valid through defaults.
- Zoho Voice audio remains provider-owned. The recommended desktop route is ZDialer browser/desktop click-to-call with headset integration; mobile/tablet uses the ZDialer mobile app and Bluetooth. Titan owns prioritization, customer context, scripting, outcomes, and progression. The existing API correctly does not claim that REST alone provides an embedded browser softphone. A future embedded WebSDK should be pursued only if Zoho grants and documents the required tenant capability.
- Database migrations `20260829173000_call_script_center` and `20260829174500_seed_call_script_center` were applied only to the development database. Prisma/TypeScript, focused lint, all 19 discovered tests, and the full Next.js 16.2.6 build pass with all 332 pages. Browser verification confirmed controller/display heartbeat, non-redundant screen-1 controller mode, the screen-2 iframe call coach, zero duplicated Communications & Sales navigation on screen 2, reconnection back to the single-screen coach, and no browser console errors. Responsive implementation uses dedicated Script, Context, and Objections views with large call targets on narrow screens.
- Netlify production deploy `6a934c148690800007681255` published commit `fa889d3511391b39f247c86c150ced1800491b98` in `ready` state. Live desktop and 390×844 mobile checks confirmed the image loaded, the headline remained readable, and the page had no horizontal overflow.

## 2026-08-29 development-only voice transcript and account reconciliation

- This work remains limited to development. No production deployment, Zoho write, phone call, customer message, or guessed customer reassignment was performed.
- A deterministic reconciliation audit covers every local `CallLog`. It uses normalized exact ten-digit contact phone/mobile matches, automatically permits reassignment only when one account is uniquely supported, and sends shared-number or unmatched calls to the existing `IntegrationException` administrator review queue.
- The development audit found 877 stored calls: 760 uniquely confirmed account links, 93 ambiguous shared-number matches, and 24 unresolved numbers. All 877 retain valid account foreign keys, zero safe account corrections were available, and 117 open `ZOHO_VOICE` account-match exceptions now expose the uncertain records for review. The one locally stored transcript is attached to an account.
- Zoho Voice ingestion no longer drops unmatched calls. New uncertain calls are retained under the stable `unknown-voice-caller` holding account, while an exception captures the evidence. Existing non-holding account links are preserved when a later sync has no stronger unique match. Exact account/contact-name fallbacks are accepted only when they resolve to one account.
- When Zoho reports transcription as complete, the administrator voice sync retrieves the transcript from Zoho's dedicated transcription endpoint in a bounded batch and stores it on the account-linked call. Call timeline indexing now runs after imports and moves the matching `CommunicationEvent` account link when a call is safely reassigned, preventing split customer histories.
- Administrators can audit and execute deterministic reconciliation from `/admin/communications`; the API reports total calls, transcripts, confirmed links, repairable links, repairs, ambiguous matches, unresolved matches, and holding-account records. `scripts/reconcile-dev-call-accounts.sql` provides a guarded development audit/reconciliation path.
- Only 1 of 877 development calls currently contains transcript text. This is an ingestion backlog, not an account foreign-key gap. Development intentionally has no live Zoho credentials, so the external transcript backlog cannot be fetched there; production credentials were not copied into development. TypeScript, focused lint, all 19 repository tests, and the full Next.js 16.2.6 build pass with 333 pages. Development port 3001 and unchanged production port 3000 both return HTTP 200.

## 2026-08-29 development-only expandable application navigation

- The normal desktop application sidebar can now expand from its compact icon rail into a labeled navigation menu. The control is keyboard/assistive-technology labeled, every route retains its existing icon and destination, section names become visible in expanded mode, and the user's expanded/collapsed preference persists in local browser storage.
- Expanded navigation reserves content width rather than covering the active workspace. The established mobile drawer, adaptive mobile bottom navigation, administrator-specific layout, public pages, and navigation-free second-display mode are unchanged.

## 2026-08-29 development-only end-to-end certification in progress

- A full two-journey production-readiness exercise is in progress against development port 3001. The running defect ledger is `docs/qa/2026-08-29-e2e-defect-ledger.md`. Production and live Zoho, shipping-label, customer-communication, and payment mutations remain outside the development test boundary until an explicitly safe stage is approved.
- Manual Lead intake is now available from the Sales CRM Leads view. It captures company, contact, title, industry, phone/mobile, email, address, ZIP, state, and timezone in a responsive portaled modal. The API trims and normalizes identity fields, validates required customer identity/email/US phone/ZIP values, and rejects matching unconverted leads rather than silently creating duplicates. Focused normalization/validation tests pass.
- Lead conversion now preserves the lead's assigned owner, uses a deterministic account external key, returns the existing Account when a converted lead is replayed, and creates the Account, primary/additional Contacts, and Lead conversion links in one serializable database transaction. This closes a retry path that could create duplicate or partially converted customer records. Full browser and concurrent-retry regression remain part of the active certification.
- Focused regression coverage now proves an already-converted lead returns its linked Account without entering another conversion transaction, and proves a successful uncontrolled Order Builder transaction clears its cart while preserving the success callback.
- The development SMS/email/provider credentials remain intentionally disabled. The requested real checkpoint messages therefore cannot be delivered from development; safe provider-failure visibility and account timeline behavior will be tested, while any actual send requires a separate environment decision and action-time confirmation.
- Scheduled-callback dispositions now require a valid date, upsert one deterministic Lead-linked Task, and cancel that unfinished Task when the lead advances. The Lead-to-Task relation uses cascade cleanup so disposable E2E leads do not leave orphaned callbacks. Browser save, replay, and cancellation checks passed in development with exactly one Task.
- The development stack explicitly enables local-only Quote and Sales Order simulation when Zoho credentials are intentionally disconnected. Simulated documents use unmistakable `dev-*` external IDs, persist through the normal local models and line-item path, never execute in production, and report that Zoho was not contacted. This permits safe lifecycle QA without misrepresenting an external sync; live Zoho remains the final integration gate.
- The account/order information-architecture pass removed duplicate desktop Call, SMS, and Quick Sale actions while retaining compact-layout access, and capped the “Popular Gifts” suggestion rail at ten items. Full catalog search and every underlying action remain available.
- The first E2E customer produced a local-only $249.99 Sales Order with one 14-inch blade line and appeared in the administrator Processing queue. Document lifecycle responses now include the already-authorized linked Account so Processing can fall back to its primary contact, billing address, and shipping address instead of falsely reporting that customer delivery data is missing.
- Second-display iframe navigations no longer replace the entire workspace with the client-side “Verifying credentials” screen while NextAuth hydrates. The same-origin session check still completes, unauthenticated frames still redirect, and Proxy/route/API authorization remains authoritative. NextAuth focus polling is disabled because controller/display focus changes were otherwise redundant session refetch triggers.
- The Next Best Action call coach now embeds the existing shared `FactFindingPanel` instead of maintaining a parallel discovery model. Sales reps can capture and revise the seven canonical Account facts (blade sizes, materials cut, supplier, average cost, crew count, order quantity, and improvement priority) inside the live script flow and save them through the existing owner/administrator-authorized account endpoint. The full panel remains available on single-screen and second-display layouts; mobile/tablet has a dedicated Discovery view. Script-library discovery prompts remain coaching content, while the shared panel is the authoritative structured account data.
- The call coach now has a prominent `Sell & close` workspace that reuses the established `OrderBuilder` for the selected account. It carries the live fact-finding answers into product matching and preserves catalog search, product/application/size filters, prior-purchase intelligence, quantities, promotional items, VIG/commission economics, Quote creation, and Sales Order creation. This makes the coached call executable end-to-end on both single-screen and second-display layouts without cloning the account Communication Center or creating a second transaction path.

## 2026-08-29 development-only storefront and sales productivity pass

- Public shop search now ranks Titan Signature/specialty blade families ahead of ordinary matching results and labels them `Titan Featured Specialty`. The ranking still applies the visitor's search and facets first. A defensive merchandising filter also suppresses gift-like apparel, hats, knives, gifts, giveaways, and promotional items even when legacy catalog classification is incomplete.
- Public shop refinement now includes an explicit specialty-only control plus product-type and saw/equipment facets alongside application and size. Product cards surface equipment fit when available so the featured placement remains informative rather than purely promotional.
- Public product detail no longer exposes the internal `Build your crew package` and giveaway-tier workflow. Pricing now directs visitors to create an account or log in. Package/gift construction remains an internal sales/admin responsibility.
- Public SKU rendering remains enabled. `NEXT_PUBLIC_SHOW_PUBLIC_SKUS=false` can suppress the frontend label without deleting or modifying SKU data; internal catalog, order, sync, and historical records are unaffected.
- The shared Order Builder places Signature/specialty blades first. Promotional gifts are collapsed by default and appear only when their cost fits a conservative 20% allowance of the current post-VIG order profit; this is a rep aid, not a replacement for approved promotion rules. Gift items remain excluded from ordinary product search.
- Historical purchases with unmistakable gift/giveaway designations are also excluded from the ordinary repurchase rail even when legacy catalog metadata incorrectly marks them as non-gifts. Their order history remains intact and promotional selection stays confined to the collapsed profit-qualified gift workflow.
- The uncontrolled Order Builder cart-reset path now has a focused component regression proving a successful transaction clears initial internal lines and still invokes the caller's success callback.
- Admin Flyer Studio retains free-shipping controls but no longer exposes tariff entry in the promotion-building interface; its compatibility payload keeps tariff cost at the existing zero default while backend polishing proceeds.
- The mobile Next Best Action view now separates the work queue and active-customer workspace into explicit tabs instead of stacking both into an excessively tall page.
- Sales agents receive a persistent `Get to work. Make money.` action throughout the authenticated app. After the configured inactivity interval (default five minutes), a full-screen black motivational prompt directs the rep back into Next Best Action. The setting is stored as `sales_idle_prompt_minutes` and is editable in Admin Settings. Activity is based on keyboard, pointer, touch, and scroll events; it does not modify timeclock records.
- A dark cinematic Battle Axe cutoff-saw composite was generated at `output/imagegen/battle-axe-real-world-saw-dark-v2.png`, with a 1600px web preview beside it. The supplied blade artwork, real guard relationship, and saw geometry remain visible in the black/orange industrial grade; the asset is not yet assigned to a public route.
- Phone-width browser checks at 390×844 found no horizontal document overflow on `/`, `/shop`, `/signature-series`, `/blade-finder`, or `/sales/todays-calls`.
- The development Order Processing workspace now adapts its command lanes, refresh action, queue height, and empty state for narrow screens while retaining the established desktop queue/detail workstation and horizontally scrollable lifecycle/table content.

## 2026-08-29 development Zoho SSO redirect guard

- Development uses `http://192.168.0.108:3001` as its application origin while Zoho login credentials remain intentionally disabled there. Its generated callback is therefore not a registered Zoho OAuth callback and must not be offered as a functioning development SSO path.
- The development employee/admin login now explains that local testing uses staff credentials and sends the Zoho SSO action to the registered secure production entry point at `https://www.tdusales.com/employee-login`. Production behavior is unchanged.
- Live read-only provider verification confirmed production advertises `https://www.tdusales.com/api/auth/callback/zoho`. Development contains the canonical Montgomery Morgan record at `monty@titandiamond.net` with an Administrator role and an existing password credential; no password or user data was changed.

## 2026-08-29 development-only GT Diamond vendor asset intake

- GT Diamond's updated public product categories were inventoried from `https://www.gtdiamond.com`. The repeatable importer covers Pro Blades, Saw Blades, Turbo Blades, Bridge Saw Blades, Core Bits, Grinding, Polishing, and Tile & Stone.
- All 447 discovered original product images downloaded successfully with source URL, source page, category, byte size, and SHA-256 metadata. Originals total 461.33 MB and are archived outside the public bundle at `output/vendor/gtdiamond-originals`.
- Web-ready 1200px WebP variants were generated with zero failures at `public/images/vendor/gtdiamond-web`, reducing the public candidate payload to 45.92 MB. Its manifest groups the assets into 296 filename-derived product candidates and distinguishes main, close-up, and alternate views.
- Only safe matched assets are referenced by the development catalog; unmatched assets remain unreferenced. Publishing-right confirmation remains a production release gate, and the manifests preserve provenance without implying ownership or permission from public availability alone.
- Structured extraction identified 169 GT vendor families. Longest-prefix and explicit compound-SKU matching found 356 unambiguous Titan product variants; the development database filled 165 previously blank image URLs without overwriting any existing image and filled 700 blank application/equipment/product-type/vendor/manufacturer fields across 180 products without overwriting existing values.
- The development public-products API now exposes 77 web-visible products using the optimized GT image paths. Another 191 initially matched products already had images and were preserved. Eighty-seven vendor families, including compound/non-sellable SKU definitions without a Titan catalog counterpart, remain review-only and were not created as Titan products.
- The matcher and reports are repeatable via `scripts/extract-gtdiamond-products.mjs` and `scripts/map-gtdiamond-products.mjs`; `output/vendor/gtdiamond-product-match-report.json` is the release review artifact. This remains development-only and no Zoho or production product record changed.

## 2026-08-29 development-only Titan product publication library

- The official GT publication center was inventoried as 51 named current product sheets backed by 50 unique source PDFs across diamond blades, core bits, grinding, polishing, and specialty products. `scripts/build-titan-product-sheets.py` provides a repeatable intake and regeneration workflow.
- Fifty-one Titan-formatted contractor sheets plus a library index were generated under `output/pdf/titan-product-sheets` and mirrored to `public/downloads/product-sheets` for development-site testing. They use Titan's black/orange field-document system, retain technical-source attribution, and do not present GT as Titan's brand. A manifest preserves source URLs and SHA-256 hashes.
- `/resources` now organizes all 51 sheets by tool family with a downloadable index. This adapts the useful publication/category structure from the vendor site while retaining Titan's visual system, product-finder workflow, and contractor-first language.
- `/technical-information` is a new public field reference with responsive blade speed/cutting-depth data, an overspeed safety warning, symptom-based troubleshooting, and direct transitions to the Blade Finder and product-tech call path. The route was added to all public/auth/layout allowlists.
- All 52 generated PDFs reopen successfully; representative blade, core-bit, polishing, and index pages were rendered and visually inspected after correcting the header wordmark. TypeScript passes, and development port 3001 returns the new route. Publication/source-image rights and Titan legal review remain mandatory production gates. GT sales terms must not be republished as Titan policy without Titan-specific legal approval.
- A separate seven-page `Titan Diamond USA Contractor Field Guide` now consolidates the reusable field information into Titan's own operational format: selection inputs, bond/material matching, rim choice, wet/dry use, cutting-depth and RPM reference, mounting and operation, troubleshooting, core drilling, and a job/reorder worksheet. Every page was rendered and visually reviewed; dense table wrapping and warning spacing were corrected before the final copy was linked from `/resources`.

## 2026-08-29 production release and financial reconciliation

- The user confirmed publication rights for the GT-derived source imagery and technical sheets. The completed frontend, sales-workspace, dual-screen, storefront, resource-library, and operational-flow tranche was released to both production targets after the mandatory database backup `backups/tdgpt-20260829-212625.dump` (34.31 MB).
- Self-host production was rebuilt and is healthy on local port 3000. Production migrations `20260828230000_operational_flow_foundation`, `20260829153000_lead_callback_task_link`, `20260829173000_call_script_center`, and `20260829174500_seed_call_script_center` were applied successfully.
- Netlify production deploy `6a93c264b8459de56476d3af` is live at `https://www.tdusales.com` (unique deploy URL `https://6a93c264b8459de56476d3af--titan-sales-portal.netlify.app`). Public health checks returned HTTP 200 for `/`, `/shop`, `/signature-series`, `/resources`, `/processing`, `/sales/todays-calls`, and `/display`.
- A forced 2026 Zoho Books reconciliation completed successfully with document-detail refresh enabled: 502 invoices, 376 sales orders, and 381 quotes processed; zero new records, zero sync conflicts, and two pending records resolved. The latest successful integration state processed 1,259 documents without a current error.
- The reconciled active 2026 invoice ledger contains 471 invoices totaling $1,067,698.28, for an average sale of $2,266.88. Computed profit totals $468,277.01 (average $994.22 per active invoice), and computed commission totals $198,521.77 (average $421.49). Every active invoice has computed profit and commission values populated (zero missing in either field). Status counts are 404 paid, 42 overdue, 23 sent, 2 partially paid, 16 draft, and 16 void; drafts and voids are excluded from the active totals. One active non-converted sales order remains, totaling $14,999. Quote counts must use the authoritative Zoho document date rather than local `createdAt`; the import-date aggregate is not a valid YTD sales metric and must not be shown as one.
- Development port 3001 was restarted after the isolated Netlify build removed shared `.next` artifacts; it regenerated cleanly and again returns HTTP 200. Future containerized Netlify builds should use a container-local build-output mount so they cannot invalidate the running development compiler cache.
- The production build, TypeScript validation, 335-page generation, 116 function/edge-function packaging, and CDN activation all passed. The current dependency tree reports 18 npm audit findings (1 low, 6 moderate, 10 high, 1 critical). They require a separately tested dependency-upgrade tranche; no breaking `npm audit fix --force` was applied during this release.

## 2026-08-30 all-time Zoho Books reconciliation in progress

- A fresh pre-reconciliation production backup was created at `backups/tdgpt-20260829-232338.dump` (34.36 MB). The local historical inventory spans 2018–2026 with 7,872 invoices, 378 sales orders, and 7,858 quotes.
- Forced detail refreshes completed successfully for 2018 (62 invoices, 44 quotes), 2019 (865 invoices, 848 quotes), 2020 (656 invoices, 634 quotes), 2021 (1,155 invoices, 1,134 quotes), and 2023 (1,367 invoices, 1,405 quotes). Those completed sweeps created zero missing documents and flagged zero sync conflicts.
- 2022 is incomplete: all 1,326 upstream invoices were enumerated, 1,325 were refreshed, and the remaining void invoice 6500 (`1254360000012868738`, $116.53, CEMENT WORKS) was quarantined because its authoritative Zoho customer ID `1254360000012736001` has no local Account or Contact match. The quote sweep stopped after 400 records when the access token became invalid. No guessed account reassignment is permitted.
- 2024 is incomplete: 1,089 invoice details succeeded before the account-wide Zoho quota began returning 429; 18 invoice details and all quotes remain to be refreshed. 2025 and 2026 could not begin because the same quota window remained exhausted. The sync cursor was not advanced for any incomplete sweep.
- The audit exposed stale 2025 denormalized commission values: active sales total $1,636,808.55 while stored commission totals $2,089,187.70. `computedFinal` contains invoice-scale legacy values on many rows. These figures are explicitly untrusted until the successful 2025 detail refresh replaces them with the canonical profit-based calculation.
- Across all invoices, Zoho IDs, sync timestamps, profit values, and commission fields are populated, and no invoice is currently flagged as a sync conflict. Populated does not imply correct for the identified 2025 legacy commission outliers. Two Creative Design Concepts sales orders reference upstream IDs that return 404 and remain pending reconciliation; 3,173 quotes have not yet received a successful full-detail sync.
- `daily-books-sync.ts` is hardened in source to acquire a current token for each request, force-refresh once after 401, apply bounded backoff after 429, mark exhausted/skipped fetches incomplete rather than incrementing synced counts, preserve the cursor on incomplete sweeps, and mark confirmed upstream 404 documents `orphaned` while clearing their retry flag. TypeScript passes; focused lint still reports only the file's pre-existing broad `any`/unused-symbol debt.
- Heartbeat automation `complete-all-time-zoho-reconciliation` resumes every two hours. It probes quota safely, reruns only incomplete years separately, resolves the CEMENT WORKS customer using authoritative evidence, audits all document/payment/profit/commission state, and must not claim completion while any provider fetch or unexplained commission anomaly remains.
- The hardening release is live on both production targets. Self-host deployment created backup `backups/tdgpt-20260830-014241.dump` (34.85 MB), passed the 335-page production build, and is healthy on port 3000. Netlify deploy `6a93f652b551c9e4b793a907` is live at `https://www.tdusales.com`; public root and Admin Data Integrations returned HTTP 200. Development was paused during Netlify artifact generation to prevent `.next` mutation, then restarted successfully and returns HTTP 200 on port 3001.

## 2026-09-21 Zoho Books structural line-item compatibility (PR pending)

- Zoho Books may return structural `header` rows inside transaction `line_items`. The pending compatibility change introduces one exact, non-coercing classifier; preserves structural descriptions/order in JSON and document presentation; and excludes structural rows from relational products, costs, profit, commission, tariff, gifts, shipping, fulfillment, purchasing, returns, recovery, inventory, and financial counts.
- Missing category remains a legacy product row. Unknown/malformed explicit categories remain visible and fail conservatively as unsupported financial rows rather than being silently discarded. The documented `subtotal` category is also structural.
- Header handling is pure and adds zero Zoho calls. Existing provider fetches, sync ranges, schedules, document totals, and schema are unchanged. No production/Zoho operation or feature activation occurred during development.
- Full call-site inventory, residual manual-script guard, sandbox activation gate, and rollback procedure are in `docs/zoho-line-item-header-compatibility-audit.md`. Production enablement remains unapproved until mixed-row sandbox acceptance passes.

## 2026-09-22 Zoho Voice campaign failure containment

- A stopped production MMS campaign reached Zoho Voice but received repeated provider failures. A later one-recipient plain-SMS test did not reach Zoho because the selected local account had no contact phone; the immediate and continuation campaign paths incremented the failure count without creating a `CampaignLog` or returning the reason to the operator.
- The pending correction records missing-phone failures consistently, returns and persists terminal failure summaries, and shows those summaries in the global campaign status UI. If every actual Zoho provider attempt in a processing chunk fails, the job now transitions to `ERROR` and stops advancing instead of consuming the remaining recipient list.
- This change does not resend either campaign, change recipient/customer data, switch providers, or claim that the underlying Zoho MMS/provider failure is resolved. A new send still requires an eligible account with a valid stored phone and deliberate operator action after deployment.
- PR #77 merged at `f98ba941294647307e616dcb92842dc2f9b844a2`. Follow-up audit against Zoho's current Send SMS v2 contract identified an additional pacing defect: the endpoint allows 20 requests per minute, while the campaign path sent an initial burst of 10 and then approximately 40 per minute. The follow-up correction sends one recipient every four seconds and rejects a second simultaneous immediate SMS campaign, leaving provider capacity for isolated direct sends. No campaign was restarted during diagnosis or validation.
- PR #78 merged at `3ceb17af784eba94b433f0bf88219ce4e4e3c16d`. A single authorized plain-SMS canary after deployment still returned HTTP 200 / `ZVSMS-4000` / `Internal server error occurred`; it made one send request and was not retried. A bounded read-only Voice number lookup then returned `ZVT022 Invalid OAuth scope`, proving the shared Zoho refresh token is not authorized for the required Voice verification surface. Voice send paths now require an isolated `ZOHO_VOICE_REFRESH_TOKEN` (with `ZohoVoice.sms.CREATE`) and no longer reuse the Books/CRM token cache; optional `ZOHO_VOICE_CLIENT_ID` and `ZOHO_VOICE_CLIENT_SECRET` may override the shared OAuth client. The dedicated token must be provisioned before another send is attempted.
- PR #79 merged and deployed at `416499acf73520bf539a8868326195eb689162f9`. A dedicated Zoho Voice refresh token was provisioned locally and in the production Netlify environment without exposing its value. Because the current Netlify plan rejects scoped write-only secrets, the user explicitly approved standard Netlify environment storage; authorized Netlify administrators can read that value. One authorized plain-SMS canary then returned HTTP 200 / `SUCCESS` / `ZVSMS-2000` on exactly one Voice request with no retry, confirming the isolated Voice OAuth path and configured sender can submit SMS successfully. No stopped campaign was restarted automatically.
- PR #83 merged at `cc65f07bbaa65746d4a965bde91370ebb4e6a5a4` and deployed the native multipart MMS upload correction. Follow-up development adds an administrator-only MMS Canary panel under `/admin/campaigns`: images are optimized in the browser to JPEG within 1024 × 1536 and 900,000 bytes, an exact confirmation is required, and each submission calls only the authenticated `campaign-job/test-send` endpoint once with no automatic retry. The endpoint now returns the sanitized complete Zoho provider result, including the preserved provider code. Development and validation must not send a message; a production canary still requires explicit action from an administrator in the confirmation screen.

## 2026-09-22 Zoho Voice MMS multipart correction (pending deployment)

- A new production MMS campaign using a validated 789,564-byte JPEG produced zero deliveries and 610 failures through sender `+14325381379`; every visible recipient log reported Zoho's `Internal server error occurred`. The image was below Zoho's documented 1,000 KB limit, so size alone did not explain the failure. No retry or new canary is authorized by this change.
- The campaign MMS paths mixed the legacy `form-data` stream package with Node's native `fetch`, manually supplied multipart headers, silently ignored media-fetch failures, and contained comma-operator checks that treated failed image downloads as successful. Immediate, continuation, scheduled, legacy campaign, and one-recipient test paths now share a native `FormData`/`Blob` builder, validate JPEG/PNG/GIF media, enforce a 900,000-byte safety ceiling, fail closed on missing/malformed media, and allow native fetch to generate the multipart boundary.
- Zoho failure summaries now retain the response code alongside the provider message. The existing one-recipient/four-second campaign pacing and provider-wide fail-fast contract remain unchanged. Production deployment and a single deliberate MMS canary remain required before any recipient campaign is attempted.

## 2026-09-23 Zoho OAuth credential isolation and rotation (pending code deployment)

- A new server-based OAuth client named `Titan Sales Portal Runtime 2026` replaced the exposed runtime client. Netlify now holds the new core client ID/secret and a new limited core refresh token with full Books and Mail scopes. CRM scopes were requested but Zoho excluded them because the current account is denied CRM access by the Zoho One administrator; CRM-dependent app features remain unavailable until an administrator grants that access and a new core grant is issued.
- Netlify also holds a separate Voice grant and dedicated Voice client variables. Live read-only verification passed token refresh, Books organizations, Mail accounts, Voice SMS logs, and Voice call logs with HTTP 200; the CRM users probe returned the expected HTTP 401.
- All SMS and Voice runtime routes now use the dedicated Voice token provider. Utility scripts no longer contain embedded OAuth client secrets, refresh tokens, authorization codes, or fallback credentials. Focused credential-hygiene and Voice-auth contract tests pass (24 tests), and TypeScript passes with `tsc --noEmit`.
- The replacement code was deployed and production campaign state was verified. The prior Self Client and its old grants were then revoked, obsolete `ZOHO_SMS_*` variables were removed, and the clean Netlify redeploy `6ab387ebbb77297f9382d7fb` published commit `ff1e197`. Books, Mail, and Voice remain operational; CRM remains blocked by the Zoho administrator policy described above.

## Google Cloud Run migration paused (2026-09-23)

- The user chose to remain on Netlify. No Cloud Run service, Cloud Storage bucket, scheduler, secret, database migration, billing link, production deployment, domain mapping, or DNS change was created. All development-only Cloud Run portability edits were removed.
- The empty Google Cloud project `Titan Sales Portal` (`titan-sales-portal-2026`) remains inactive and unbilled. `titandiamondmarketing@gmail.com` and the original Future Factory account are temporary project owners; neither owner was removed and the project was not deleted.

## 2026-09-23 Titan AI qualification, knowledge, and engagement planning

- Titan AI now grounds company how-to and operating questions in the canonical Training Hub content through `search_titan_knowledge`, alongside its existing live sales, account, invoice, commission, product, communication, and performance tools. Its system contract prohibits invented figures, unrestricted-access claims, and success claims without a tool result.
- `query_upcoming_engagements` combines the signed-in user's due/overdue Tasks, open Work Assignments, and active Deal Automation steps due within a bounded horizon. The assistant is instructed to prioritize overdue and high-priority work, explain what is coming next, and offer the matching action rather than silently executing it.
- Built-in and database-defined AI tools now use an explicit `VIEWER < AGENT < MANAGER < ADMIN` qualification policy. Custom tools store their minimum role and confirmation requirement; the admin editor exposes both controls. Server-side ownership filters and endpoint authorization remain authoritative.
- Every built-in write (`toggle_timeclock`, `create_task`, `update_task_outcome`, `log_sales_call`, and account status/quality updates) produces a short-lived, user-bound signed confirmation instead of executing on the model's first request. The chat UI presents a confirmation button. Confirmed actions are audited in `OperationalAction` with a token-derived idempotency key, preventing double execution from retries or repeated clicks.
- The schema migration `20260923220000_ai_tool_qualification` adds the custom-tool qualification fields. Focused authorization/signature tests and TypeScript validation pass. Production activation requires applying the migration and deploying the application together.

## 2026-09-23 bounded 2025–2026 VIG and commission reconciliation

- The canonical calculator previously honored a legacy Zoho `COMMISSION FROM PROFIT %` value of 40%, allowing stale 2025–2026 records to survive recalculation even though the business default is 50%. The shared browser/API and Netlify calculation modules now normalize only exact 40% values on documents dated in 2025 or 2026 to 50%; other years and non-40 explicit rates remain unchanged.
- Administrator-only `GET /api/admin/books/financial-reconciliation-2025-2026` reports invoice and sales-order counts, raw 40%/50% custom-field populations, calculated rates, missing profit/commission/VIG snapshots, fallback-cost usage, and commission mismatches for the exact `[2025-01-01, 2027-01-01)` window. It is read-only and exists for before/after evidence.
- The intended production correction uses the existing bounded date-range cost processors separately for invoices and sales orders with tariff application disabled. Each document is fetched from Zoho Books, recalculated through the shared VIG/dead-cost/shipping/fee/commission logic, written back only when calculated custom fields differ, and persisted locally. No line items, customer assignments, payment amounts, invoice totals, or tariff adjustments are changed by this reconciliation.
- Focused tests prove the 2025–2026 40%→50% boundary and preservation of 2024/2027 and other explicit percentages. TypeScript and the full Netlify production build pass. Production execution must capture the pre-audit, processor counts/errors, and post-audit; it must not claim completion while any processor error or remaining 40% record exists.
# All-time invoice export reconciliation (2026-09-23)

- Added administrator-only `/admin/invoice-export-import` and `/api/admin/invoice-export-import` for portal-only Zoho Books invoice CSV reconciliation.
- The client groups line-item rows by immutable Zoho Invoice ID and sends bounded batches. Preview reports creates, updates, unresolved customers, and invalid records before Apply is enabled.
- Apply upserts scalar invoice fields, line items, financial snapshots, commission/VIG fields, and lifecycle status without calling Zoho or queueing outbound cost work. Finalize marks local invoices absent from the authoritative all-time export as `Orphaned`; it never deletes them.
- The production export received 2026-09-23 contains 7,893 unique invoices and 30,536 line-item rows covering 2018-05-22 through 2026-09-22. Zoho writes remain prohibited until separate explicit confirmation.
- The first production preview found 7,885 updates, zero creates, zero invalid rows, and eight invoices whose customer IDs were absent locally. The importer now falls back to a unique, case-insensitive exact account-name match; duplicate local account names remain unresolved instead of being guessed.
- Netlify retries for the account-name fallback were blocked before compilation by Prisma `P1002` while acquiring its PostgreSQL migration advisory lock. Netlify builds now use Prisma's supported `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` setting; this deployment contains no schema migration and does not change invoice data during the build.
- The second preview resolved SPECIALIZED CONCRETE but found seven invoices across five customer IDs with no portal account. Preview may now propose a portal-only account creation when the export salesperson uniquely matches a portal user; apply creates only those exact Zoho customer IDs and reports them separately before importing their invoices. Ambiguous or missing salesperson matches remain unresolved.
- The approved commission-ledger opening date is 2025-01-01. Eligibility follows the invoice issue date, so customer payments received after that date never make a pre-2025 invoice commissionable. Payouts before the opening date and orphaned/deleted invoices are excluded from balances; the rule is shared and boundary-tested.

## 2026-09-25 lifecycle acceptance reconciliation follow-up

- Follow-up work from production merge `dc27416e8213ede8759da046550bc02fda319012` adds an administrator-only reconciliation workspace for existing local Account/Lead records and exact Books products. It never creates another local Account or another Books customer and requires the Lead's immutable `convertedAccountId` to match the requested Account.
- Books primary contact-person IDs are recovered with one targeted customer read and persisted only after a unique exact email or normalized-phone match. Company-name-only matching is prohibited.
- Task creation now links through the local Account ID, requires its authoritative CRM Account mapping, submits that mapping to Zoho CRM, and preserves readable provider error code/message details.
- Exact SKU RFD-50A060 may be reconciled to its unique Books item and active preferred vendor. Verified sales/purchase values are stored as authoritative; dropship remains unknown/blocked unless Books supplies an explicit positive flag. Zero stock is never used as dropship evidence.
- The gift fallback remains exact Books item `1254360000043727500`, $0 sale price, $20 authoritative cost. No acceptance communication or financial transaction is authorized without a final just-in-time confirmation.
- Added administrator-only `/admin/ross-commission-reconciliation` to preview/apply portal-only 2025–2026 Ross Haisler corrections. It requires an authoritative monthly VIG rate and stored cost buckets, recomputes dead cost plus VIG, profit, dead profit, and 50% commission to cents, fails closed on any missing input, and never calls or queues Zoho.
- VIG Management now separates the company profit/VIG variance from the representative-pay impact. Months at the 1.50x penalty rate display the exact 50% commission reduction versus 1.30x, and the document breakdown includes the same per-document pay delta to cents.
- User-facing terminology identifies 1.30x as the normal VIG and 1.50x exclusively as the missed-goal penalty; 1.50x is never described as a target.

## 2026-09-25 lifecycle mapping and task production acceptance

- PR #103 merged at `c35bee3876b62d6218a7917c585b7ddbc6d799df`. PR #104 then closed a false-success route that treated any nonempty legacy CRM mapping as authoritative; it merged at `9a65046417d4131aec67fc6063034fe872d84c4b` and deployed through Netlify deploy `6ab602ed6c36160008c4be1e`.
- The exact existing TEST Account `cmug0bjgs0002z35hikn7od9w` and Lead `cmufz988p00012v293aj45jas` were reconciled without creating a second local Account or Books customer. Read-only verification confirms the CRM Lead, CRM Account, CRM primary Contact, Books Customer, and Books primary Contact mappings are all authoritative 19-digit provider identifiers.
- One acceptance Task named `Lifecycle acceptance task 20260924` was created and verified exactly once. It is linked to the exact local Account and has an authoritative CRM Task identifier. No email, SMS/MMS, financial document, payment, purchase order, shipment, or label was created during this acceptance step.
- The exact TEST Account preflight confirms its primary contact matches the approved `ben@titandiamond.net` and `6183355304` controls, its saved Centralia address matches the approved test address, and it has zero existing Invoice/Sales Order records and $0 prior nonterminal financial-document value.
- RFD-50A060 remains active locally with a mapped Books item, $0.91 sale price, $0.36 authoritative cost, and a verified vendor. `canDropship` remains unknown because the provider supplied no explicit eligibility evidence. Product-dependent dropship acceptance must remain blocked; neither zero stock nor vendor presence is sufficient authorization.
- Fresh pre-release backup `netlify-20260924-215301.dump` is 331,748,182 bytes with SHA-256 `F77085C3F36B65E9D7D825382A75A28AB513B92EB480445F56F4BC928A7A54F4`; `pg_restore --list` read 649 entries successfully.

## 2026-09-25 dropship authorization and purchase-order safety follow-up

- PR #105 merged as `886c3f5ce75140211fdc54ec813358572a40e0cb` and Netlify deploy `6ab612447533790008a8dcd7` published that exact commit successfully.
- Zoho Books documents transaction-level drop-shipment fields on purchase orders, but its Items API does not document an item-level `is_drop_shipment_enabled` eligibility field. `Product.canDropship` is therefore an application-managed, audited business authorization—not provider item evidence. Product reconciliation and general item sync must preserve it rather than clearing it from an undocumented response field.
- The business owner confirmed that vendors may dropship generally. The explicit exception is Pioneer: when the customer destination is California, the product must ship to Titan first and may not be direct-dropshipped. The purchase-order boundary enforces this exception from the verified vendor and sales-order destination.
- For exact acceptance item RFD-50A060, the verified active preferred vendor is `CONTINENTAL ABRASIVES`. An administrator-only, idempotent route records the exact product/vendor authorization, prior value, approving administrator, reason, and timestamps in `OperationalAction` before setting `canDropship=true`.
- The legacy dropship purchase-order path was unsafe: it could invent purchase cost as 50% of retail and had no durable provider-write claim. The repaired path requires exact Books item mapping, exact vendor agreement, `canDropship=true`, and authoritative positive unit cost; it uses a caller-stable UUID plus `ProviderWriteOperation`, persists ambiguous provider acceptance before local persistence, and never automatically resubmits syncing, failed, or ambiguous operations.
- PR #106 merged as `0d8fe768fe421646359a0f21bcfd8683939e9c2a` and Netlify deploy `6ab61f2fd7716b0008cd1ca2` published that exact commit. Backup `netlify-20260925-001213.dump` was 331,748,748 bytes, SHA-256 `8D6985735A5BFDF81264669EB98449F0EAB9DFD715F8F41DA8122AA7767E04E4`, and produced a readable 660-entry restore list.
- The exact RFD-50A060/CONTINENTAL ABRASIVES approval was then applied once through a guarded, idempotent production transaction and recorded in `OperationalAction`; no Zoho request or financial document was created. Read-only verification shows the approved TEST Account and contact mappings remain authoritative, the exact address is present, cumulative document/shipping spend remains $0, and the existing CRM-backed lifecycle Task remains unique.
- Browser acceptance exposed a separate POS defect after the authorization: `StandaloneOrderBuilder` loaded only the first 100 products, omitted the local Account ID from the shared transaction hook, and displayed an independent success toast that never submitted a transaction. A follow-up must route the POS through the shared authenticated/idempotent order builder, add bounded catalog search, and show explicit CRM/Books mappings instead of the legacy `Account.zohoId` placeholder. No transaction was attempted through the defective control.

## Voice follow-up replay safeguards (local, unreleased, 2026-09-25)
- Branch codex/voice-followup-replay-safety: callback deadlines derive from call time, replay preserves user task edits, recommendations use a deterministic primary key, reviewed legacy recommendations are retained, and unmatched holding-account events do not schedule customer work.
- Five mocked regression tests pass. No production writes/deployments; full release gates remain open. Caller-leg reconciliation and CRM persistence are not established. User explicitly approved assigning the 04:51 test call to TEST Incorporated; this authorization has not been applied to production.

## Transcript parser repair (local, unreleased, 2026-09-25)
- Branch rebased onto origin/main d68f00b3. Existing replay safeguards retained.
- Official Zoho transcription response uses serialized transcribeObj with transcriptJson; the former parser could return the raw JSON as transcript text. A pure parser now extracts segment text, supports existing wrappers, rejects provider errors/analysis-only or malformed JSON, and bounds nesting. Five additional regression cases pass (10 focused tests total); focused lint passes.
- The TEST follow-up has since been saved in production and independently verified as CRM task 6821836000027791003. Do not duplicate it. Native CallLog/recording import, audited preview/apply, protected playback and CRM Calls synchronization remain unimplemented and must not be represented as complete.

## Scoped Voice reconciliation implementation (unreleased)
- Added administrator-only exact-ID Zoho preview/apply, five-minute actor-bound signed preview, stale-call checks, serializable local transaction, source-key audit/replay verification, existing-task linkage and transcript-backed CommunicationEvent persistence. Does not create a CRM Calls record or send communications.
- Added explicit authenticated recording POST with a fixed provider host and provider-returned filename requirement; redirects, non-audio responses and guessed filenames are rejected.
- Added administrative preview/apply UI and link from Communications. Sequential webhook/bulk replays skip manually audited calls. Simultaneous bulk-write races still require database integration testing/stronger shared serialization before release.
- 20 focused tests passed; TypeScript and focused new-file lint passed. Native CRM Calls durable write/reconciliation, recording payload verification, concurrency integration tests and build/deployment verification remain release gates. Never deploy this as complete native synchronization yet.

## Shared locking and native CRM Calls implementation (unreleased)
- All provider ingestion/reconciliation paths now use a transaction-scoped PostgreSQL advisory lock and re-read the manual audit inside READ COMMITTED. Call indexing shares the transaction. Analysis rejects stale source versions; legacy edits cannot alter audited provider evidence.
- Added durable CRM Calls operations: exact CRM mappings, source references and transcript; atomic pending-only submission claim; explicit provider rejection handling; uncertain outcomes are never automatically resent. Accepted IDs are retained before independent field-by-field readback. Existing task 6821836000027791003 remains untouched.
- Added protected recording tests and disposable PostgreSQL CI lock/rollback coverage. Local focused suites: 38 tests passed before final validation. Database concurrency execution, full build, provider filename/playback verification and production acceptance remain pending.
- CRM form inspected read-only: Call Duration explicitly uses minutes and seconds. CRM task remains visible with its TEST account association. No production call record, message or deployment was created.

## Live provider contract verification, 2026-09-25
- Exact read-only Voice GET for 3437f313-1e67-4745-af19-f5f3013cc26f returned status SUCCESS, call_log.uuid, duration 01:25, start_time 1790337109000 and nested call_recording.recording_filename. Added exact-ID validation for this live envelope alongside the published logs sample.
- Provider returned 3437f313-1e67-4745-af19-f5f3013cc26f_recording.mp3. Uppercase mode=Play was rejected with ZVT015; lowercase mode=play returned HTTP 200, application/octet-stream, 111744 bytes and an MP3 frame header. Proxy now validates audio signatures and limits buffering to 25 MB. Full portal playback still requires deployed browser verification.
- Shared caller matching excludes known Titan routing numbers (plus additive VOICE_BUSINESS_NUMBERS), removes name-only fallback and international suffix collisions, and keeps multiple-account matches ambiguous. No bulk production reconciliation was run.
- 44 focused mocked tests pass. Native CRM Calls code is implemented locally but no CRM Calls write has been made. Real PostgreSQL concurrency CI and deployment checks remain required.

## Review follow-up
- Manual apply now resolves the exact account-match exception and moves source-linked commitment associations atomically. Local replay reports CRM verification NOT_CHECKED rather than incorrectly declaring an already-synced call incomplete.
- CRM-only administrator endpoint tests added (47 focused mocked tests total). Disposable PostgreSQL lock/rollback tests, complete migration chain and upgrade rehearsal passed in GitHub run 36139154048.
- Live CRM read-only preflight: exact source-subject search HTTP 204; existing native call readback confirmed Call_Duration 00:07 means 7 seconds. The exact TEST transcript returned four matching segments via transcribeObj.transcriptJson. Recording buffer limit reduced to 4 MiB for bounded serverless playback.

## PR 116 production verification and player layout follow-up
- PR 116 merged at 6e496e604a6aa87385a33a788a97f1d3a508a254 and production deploy 6ab674912a24e70008476b13 published 2026-09-25T13:22:45.628Z. Final CI: 49 voice tests including real PostgreSQL concurrency, 21 sync/lifecycle tests and 5 order-builder tests passed; migration chain/upgrade, TypeScript, build and bundles passed.
- Browser applied the authorized TEST association once: portal CallLog cmugzrxut00025hlhcyeaxl0u, audit cmugzrxxf00065hlhp6h9nu91, native CRM Calls 6821836000027793001. Durable operation cmugzsb8500085hlhjoqx6rft is SUCCEEDED with attemptCount 1. CRM UI independently shows Ben TEST, TEST account, inbound 01:25, and full source-referenced transcript in Description. Existing task 6821836000027791003 preserved.
- Protected recording decoded in the browser (27.936 seconds, readyState 4, no media error), but inherited flex layout collapsed its controls to zero height. Focused follow-up wraps form content in a non-shrinking block, gives audio explicit height, uses existing shared Button styling and makes the association reason multiline. Playback interaction and replay verification remain pending. CRM dedicated transcription/recording fields remain blank; transcript is in Description and recording is protected in portal.

## Production acceptance ? September 25, 2026

PR 116 is released: merge 6e496e604a6aa87385a33a788a97f1d3a508a254, production deploy 6ab674912a24e70008476b13 published 13:22:45.628 UTC. This supersedes earlier unreleased-status notes. Final validation passed: 49 voice tests (including two real PostgreSQL concurrency tests), 21 lifecycle/sync tests, five order-builder tests, migration-chain/upgrade checks, TypeScript, focused lint, Netlify build/bundling and preview checks. CI run 36139547326.

The authorized TEST call was applied through the production administrator UI. Portal call cmugzrxut00025hlhcyeaxl0u, association audit cmugzrxxf00065hlhp6h9nu91, CRM Calls 6821836000027793001 and operation cmugzsb8500085hlhjoqx6rft (SUCCEEDED, attemptCount 1) were independently verified. CRM account/contact 6821836000027779001 / 6821836000027779002 match. Existing task 6821836000027791003 was preserved. Repeated apply and CRM verification retained exactly one call with no additional provider submission. The account Comm Center displays the full transcript and 85-second inbound call.

Recording bytes are authenticated and verified MP3 (111744 bytes); browser decoding reports 27.936 seconds. A collapsed-player layout defect found during acceptance is corrected by PR 117, merge fcf41b7a8c280deb146f706af35647da05496a15; final deployment/playback evidence follows.

Limitations: caller identity remains human-confirmed. Native CRM Description contains transcript and source IDs; dedicated Call Transcription, Voice Recording and Telephony External ID fields remain blank. No broad synchronization, outbound calls/messages, transactions or routing changes were performed. Ben-only queues remain unchanged. No uncertain product facts were written to the account.

## Final recording playback acceptance

PR 117 production deploy 6ab678290435190008a14df3 published September 25, 2026 at 13:37:11.507 UTC, exact merge fcf41b7a8c280deb146f706af35647da05496a15. Browser reloaded published UI, replay verified the existing association, and authenticated recording loaded successfully. Native Play changed to Pause, media currentTime advanced from 0.075492 to 7.681463 seconds with paused=false, readyState=4 and error=null. Player height is 54px; duration 27.936 seconds. Playback was then paused. Actual browser playback: PASS. Audio intelligibility was not independently assessed.

PR 116 and PR 117 code is merged and published; scoped acceptance is complete. Remaining broader caller-ID correlation, dedicated CRM telephony-field mapping, transfer-outcome and recording-notice work remains explicitly outside this acceptance.

## Retell provider configuration follow-up (2026-09-25 06:47 MST)

Published Retell agent agent_81659e947587662c7d37d5bb13 configuration, titled Ben-only routing and evidence-based outcomes. Publication list shows V0 assigned +16028479868, with new draft V1. Corrected Sales staffing to Ben only, one AI introduction, known business-number exclusions, explicit-evidence Call Successful criteria, truthful summary rules and separate source-backed transfer_outcomes extraction. Existing transfer functions/destinations unchanged. Saved values verified after reload; new live call behavior NOT RUN. This is prompt configuration, not deterministic event integration.

Concrete blockers: RETELL_API_KEY absent in local and Netlify configuration; agent webhook blank and Retell provider ingestion unimplemented. CRM Calls field metadata GET returned 401 OAUTH_SCOPE_MISMATCH; read-only ZohoCRM.settings.fields.READ consent was requested, not granted or applied. Original-caller preservation is unverified: current toll-free PSTN Forward form has no such option and no external SIP profile exists. Shared titan recording profile has Repeat Notification None and a one-space recording message; no shared/direct-call coverage was disabled. Duplicate notice needs controlled audio/leg evidence before further changes.

CRM Call 6821836000027793001, portal call cmugzrxut00025hlhcyeaxl0u, task 6821836000027791003, human-confirmed association and Ben-only queues preserved. No new calls/messages/transactions, broad sync or Netlify runtime deployment. Detailed evidence: outputs/voice-provider-followup-20260925.md in the task workspace.


## Credential recovery and current-source audit (2026-09-25)

The Runtime OAuth exchange passed CRM Calls field metadata, modules and users. The helper then failed its Books date-filter check after saving the refreshed token locally and to Netlify. Root cause was the helper timestamp offset +00:00; the existing application uses +0000. The helper was corrected; independent Books items, Inventory items and Books filtered invoices reads each returned HTTP 200/provider code 0. No repeat consent is required for this failure.

Netlify RETELL_API_KEY is now present. This verifies configuration presence only, not runtime authentication. Latest published production deploy observed: 6ab699136f2d410008b6cf45, commit c306ece221703b377a098bde1da098e4e795df52, published 2026-09-25T15:57:57.117Z. Current source still has only a human-confirmed Retell reference, with no Retell provider client or ingestion implementation. Deployed-runtime Retell/CRM metadata access remains NOT RUN.

Actual CRM Calls metadata: From_Number__s and To_Number__s are API-writable phone fields; Voice_Recording__s is an API-writable website field. Telephony_External_ID__s has api_create=false and api_update=false: do not write it. Call_Transcription__c is a fileupload field, with conflicting read-only/operation flags; a plain-text write is invalid and supported upload/attachment semantics require verification. Keep transcript in Description and recording access protected until those contracts are established.

Independent exact CRM search returned one Call 6821836000027793001, correct account/contact 6821836000027779001 / 6821836000027779002, inbound 01:25, retained task/Retell references and uncertain specifications. Dedicated recording/transcription remain empty. No business records, routing, communications or provider writes were changed in this audit.

Remaining implementation: server-side exact-ID Retell authentication/read verification, authenticated event ingestion and durable reconciliation, provider-backed transfer outcomes, supported dedicated CRM field updates with independent readback, and original-caller correlation. Preserve the existing task and audited human association. Field metadata alone does not establish automated caller identity.


## Scoped Retell implementation (local, release pending)

Branch codex/voice-provider-verification adds an administrator-only exact-call API read/import, immutable content-addressed Retell evidence in OperationalAction under the shared Zoho call lock, and a raw-body SDK-signature-verified webhook. Only a unique existing human-confirmed association is eligible; unknown/ambiguous calls are ignored without account matching or outbound work. Existing CallLog, CRM call, task and Zoho transcript remain unchanged. Retell transcript is separately visible in the administrator reconciliation screen. Provider transfer events distinguish attempted, destination-connected (not human-verified), cancelled and conflicting-attempt evidence. AI analysis cannot establish success. Signed recording URLs are excluded from persistence and responses. No migration.

Thirty focused tests pass (16 new Retell cases plus 14 existing CRM/matching cases). Full release checks, deployed Retell authentication, webhook configuration/delivery and production import/replay remain pending. Dedicated CRM transcript/recording integration remains outside this tranche because field upload and protected-link contracts need separate implementation.


## Retell scoped production release and acceptance

PR #122 merged as 60abd9b1a52787386172ec1adf34cf3ef34b051c; production deploy 6ab69e805ca01a0008c46814 published 2026-09-25T16:24:52.088Z. Server-side Retell exact-call read and browser import/replay passed. One immutable evidence row cmuh69zbr0001no8dg7sh9s46 stores the receptionist transcript separately; original portal/CRM call, task, audit and provider submission count 1 remain independently verified. Signature-negative checks and Retell dashboard webhook test passed. Retell V1 Signed scoped portal evidence is published and assigned to the existing inbound number; outbound remains disabled.

This supersedes earlier missing-key/unreleased notes. It does not establish automatic caller matching or new live-call acceptance. Unmatched events are currently acknowledged without persistence; a durable unassigned inbox and reconciliation/backfill remain necessary before broader rollout. Dedicated CRM file-upload transcription, protected recording links, caller-leg correlation and duplicate recording notices remain unresolved. See docs/retell-production-acceptance-20260925.md for full evidence and limitations.


## Durable unassigned inbox follow-up (local, release pending)

Acceptance review identified that acknowledging unmatched events without storing them would lose pre-association transfer evidence. The follow-up stores sanitized signed events in an immutable RETELL_UNASSIGNED_EVIDENCE inbox under a Retell-call advisory lock and unique fingerprint. No account/contact, task or CRM write is made. Later confirmed exact-ID reconciliation also reads this inbox, preserving transfer events regardless of association timing. Administrators can inspect the 25 latest unassigned-at-receipt audit entries through a database-only endpoint. Retryable database errors do not receive success acknowledgement. This supersedes the initial discard design when deployed.
