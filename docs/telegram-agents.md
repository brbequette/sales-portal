# Telegram sales agents

This integration is an isolated implementation on `codex/telegram-sales-agents`. It is not deployed or connected to a bot. No customer messages, Telegram messages, AI-provider calls, or production business writes were made during development.

## Roles and first execution scope

One bot provides `/accounting`, `/graphics`, `/operations`, `/collections`, `/sales`, and `/products`. Separate bot identities can be added later if audiences or business boundaries warrant them. Accounting is limited to exact administrator/manager roles; reps retain account-owner restrictions. Every tool reads current portal identity and permissions rather than accepting roles from Telegram or the language model.

All agents can propose portal-only task creation and completion. Completion explicitly asks the user to attest that the underlying work is actually done, and guards against changes since the proposal. The Graphics agent can propose a branded SVG product flyer, with escaped catalog text and verified product/price/version. These are vector template drafts, not AI photography or a full design studio. No task is pushed to Zoho by these tools. Financial corrections, payments, invoice write-back, customer SMS/email, shipments, and order changes are not yet connected action tools; agents must not claim otherwise. They can recommend these workflows and create review tasks.

## Pairing and message processing

- `/telegram` is an authenticated portal connection page. Pairing uses a random 192-bit, single-use code, stored only as a hash, with a ten-minute expiry. A portal user and a Telegram user each have at most one active pairing. Disconnect invalidates outstanding pairing requests and queued replies bound to the old pairing nonce.
- The webhook accepts only direct private text messages, verifies Telegram's secret header, bounds input, and queues each update exactly once. It ignores groups and bot senders. Link endpoints require a portal session and same-origin writes.
- A scheduled dispatcher hands durable jobs to a Netlify background function. Jobs claim atomically, re-check identity before tools and delivery, and never automatically resend an ambiguous reply. Failed/stuck RUNNING jobs require investigation; do not reset them blindly because Telegram delivery may already have succeeded. Scheduled dispatch is inert unless the integration is fully configured and enabled.
- Conversation turns currently require explicit account/product/task context; persistent conversational memory and full-corpus call analysis are not implemented. The existing transcript import continues independently.

## Evidence and accuracy

Data tools retrieve authorized account records, bounded call transcripts, texts, notes, tasks, invoices, orders, and published product specifications. Financial review includes calculation timestamps, pending sync, and conflict flags. Call retrieval exposes imported-text coverage and truncation. Customer text is untrusted input, not agent instructions. A second model pass checks the draft against the retrieved evidence; this reduces unsupported claims but cannot mathematically guarantee zero hallucinations. Business writes have separate deterministic validation and database read-back.

Missing account links, missing transcripts, stale snapshots, unsupported integrations, or incomplete source records remain limitations. The agents must report missing evidence rather than substitute a guess. Current tool queries are bounded; an answer must not claim a complete account/company audit from a sample. No new live Zoho reader was started, preserving the transcript import's single-reader API ledger.

## Action approvals and measured readiness

`propose_action` creates an expiring audit record with exact affected records and proposed changes. Only `/approve ACTION_ID` from the paired user can execute it; model tool calls cannot invoke approval. `/cancel ACTION_ID` cancels it. Approval re-checks actor, pairing nonce, role, account ownership, expiry, and record versions. Claim, local change, read-back, and success receipt share a database transaction, so duplicate requests do not repeat the change.

After inspection, `/review ACTION_ID correct` or `/review ACTION_ID incorrect` records an immutable human outcome review. A successful write alone is not treated as a correct recommendation. The operational readiness score is calculated per user, agent, and action type from up to 100 observed outcomes; it is not model self-confidence or a probability of correctness.

Initial automatic-approval gate: at least 50 human-reviewed outcomes, at least 98% correct, a readiness score of 95+, complete deterministic evidence, and no failed/incorrect outcome among the latest 50 outcomes. The score uses `floor(100 * verifiedCorrect / (reviewed + 2))`; no track record starts qualified. A new failure blocks eligibility again. An explicit management command `/auto create_task on` is additionally required, and eligibility is rechecked at execution. `/auto create_task off` disables it. Only portal-only task creation can qualify initially; completion, artwork, financial actions, and customer communication cannot silently expand into this permission. Management enablement currently applies to its own paired account; management configuration for other reps is future work.

## Activation prerequisites

1. Create the Titan bot through [BotFather](https://t.me/BotFather) using `/newbot`. Keep its token out of source control and chat messages.
2. Store server-only Netlify secrets/settings: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without `@`), distinct random `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_WORKER_SECRET` (at least 32 characters each), `TELEGRAM_PUBLIC_ORIGIN` (HTTPS portal origin without trailing slash), and `TELEGRAM_ENABLED=true`. Never use a `NEXT_PUBLIC_` secret. The existing AI-provider configuration is required.
3. Review and deploy this branch, then register `https://PORTAL_ORIGIN/api/telegram/webhook` using Telegram `setWebhook`, `secret_token=TELEGRAM_WEBHOOK_SECRET`, and `allowed_updates=["message"]`. Do not place the token in shell history or logs. The Telegram API supports secret-header webhook verification: https://core.telegram.org/bots/api#setwebhook.
4. Pair an administrator at `/telegram`; verify a read-only question, an approved reversible test task, duplicate approval, disconnect, and rep isolation. Only then invite reps. Automatic approval stays off while reviewed evidence accumulates.

The existing `SystemSetting` and `OperationalAction` models hold pairing, policy, queue, proposal, and outcome records, so this first version has no database migration. Pairing-code cleanup, job retention, operational alerting, richer persistent context, domain-specific financial/customer-write tools, rendered raster artwork, and bulk transcript analysis remain follow-ups before a broader autonomous rollout.

## Validation

Sixteen focused tests cover webhook/private-chat policy, account ownership, tool restrictions, locked users, proposal expiry, revoked pairing, replay prevention, verified task creation, executor-side automatic-approval checks, and confidence failure gates. TypeScript and the isolated Next.js webpack production build pass; both Netlify worker bundles also compile. No live Telegram/AI acceptance test has run because bot credentials and deployment are still pending.
