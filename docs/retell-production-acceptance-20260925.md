# Scoped Retell production acceptance — September 25, 2026

## Release

- PR #122 merged as `60abd9b1a52787386172ec1adf34cf3ef34b051c`.
- Netlify production deploy `6ab69e805ca01a0008c46814` published at `2026-09-25T16:24:52.088Z`.
- Candidate `b6801c100cca37f3bb488fa90b7923c83b101622`: 36 focused tests passed locally; TypeScript and focused lint passed. GitHub run `36159149661` passed migration-chain/upgrade, shared database locking, scoped route and lifecycle/sync checks. Netlify preview and production compilation, TypeScript and function packaging passed. No pending migration.

## Independently verified acceptance

| Check | Result | Evidence |
| --- | --- | --- |
| Production Retell credential and exact-ID read | PASS | Browser import retrieved `call_4b75ff8b12c196612b99a3a39ed` from Retell using the server-side key. |
| Transcript storage/display | PASS | Immutable action `cmuh69zbr0001no8dg7sh9s46`; 148-character receptionist transcript visible in the admin page. No recording URL stored. |
| Replay | PASS | Second browser import reported existing evidence; independent database query still returned exactly one Retell evidence row. |
| Existing portal call/task/audit | PASS | Call `cmugzrxut00025hlhcyeaxl0u`, task `6821836000027791003`, association `cmugzrxxf00065hlhp6h9nu91` retained with original TEST account/contact. Call updatedAt remained unchanged. |
| Existing CRM call | PASS | Exact provider read found one `6821836000027793001`, correct account/contact, inbound 01:25, original source references and uncertain product specifications. Durable CREATE_CALL operation remains SUCCEEDED, attemptCount 1. |
| Unauthorized access | PASS | Preview and production admin import and unsigned webhook POSTs returned HTTP 401. |
| Retell dashboard webhook test | PASS, limited | Retell reported “Test webhook sent successfully” against the published endpoint. This is a provider dashboard test, not a new live-call delivery/persistence test. |
| Published agent configuration | PASS | V1 “Signed scoped portal evidence” published at 09:28 MST; existing +16028479868 inbound assignment changed from V0 to V1 and confirmed after reload. Outbound remains None/disabled. |
| Live call after publication | NOT RUN | No new paid calls were initiated. |
| Historical transfer outcome | UNKNOWN | Historical API response is insufficient to establish human answer; UI does not promote an AI summary to success. |

Webhook URL: `https://www.tdusales.com/api/webhooks/retell`. Subscribed events: call_started, call_ended, call_analyzed, transfer_started, transfer_bridged, transfer_cancelled, transfer_ended. Transcript-updated streaming remains off. Existing greeting, model, voice, transfer functions, destinations, Ben-only staffing and fallback were preserved. Draft V2 was created automatically on publication; it is not assigned to the number.

## Scope limits and follow-up

This is a scoped integration, not complete automated account synchronization. Only a unique previously audited human-confirmed association is imported. Unmatched/ambiguous signed events are acknowledged without an account write. New unmatched calls therefore need an explicit reconciliation/backfill workflow; automatic caller matching is not established. A durable unassigned event inbox should precede broad rollout so transfer events can be retained before account reconciliation.

Retell evidence is stored separately; the existing Zoho transcript and CRM Description remain intact. CRM dedicated transcription/recording fields remain empty. Telephony External ID is API-read-only; Call Transcription is a file-upload contract, not text. Supported upload/attachment integration and authenticated recording-link design remain work to implement, not verified features.

Original-caller provider-leg correlation, duplicate recording-notice cleanup, new live-call event persistence and human transfer-answer verification remain unresolved/not run. No autonomous follow-up task creation, broad outreach, collections, orders, payments or labels were activated. No additional paid test calls were initiated; historical cumulative test spending was not re-audited in this turn. Preserve the $100 cap and approved recipients.

## Provider contract references

- https://docs.retellai.com/api-references/get-call
- https://docs.retellai.com/features/webhook-overview


## Durable unassigned inbox follow-up (local, release pending)

Acceptance review identified that acknowledging unmatched events without storing them would lose pre-association transfer evidence. The follow-up stores sanitized signed events in an immutable RETELL_UNASSIGNED_EVIDENCE inbox under a Retell-call advisory lock and unique fingerprint. No account/contact, task or CRM write is made. Later confirmed exact-ID reconciliation also reads this inbox, preserving transfer events regardless of association timing. Administrators can inspect the 25 latest unassigned-at-receipt audit entries through a database-only endpoint. Retryable database errors do not receive success acknowledgement. This supersedes the initial discard design when deployed.
