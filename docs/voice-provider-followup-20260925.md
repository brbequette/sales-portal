# Voice provider follow-up — September 25, 2026

## Completed configuration changes

Retell agent `agent_81659e947587662c7d37d5bb13` was updated through the authenticated browser and published at 06:47 MST. The publication list labels the release `V0: Ben-only routing and evidence-based outcomes`, assigned inbound number +16028479868; a new draft V1 was created automatically.

- Corrected stale Sales staffing from four people to Ben Bequette only.
- Saved one clear AI introduction: “Thank you for calling Titan Diamond USA. I’m Alex, your AI assistant. How can I direct your call?”
- Removed conflicting instructions to verbally announce an “attempt” while retaining natural brief transfer language.
- Excluded all five known Titan routing numbers from customer identity.
- Replaced generic Call Successful criteria with explicit outcome evidence; failures, false results, SIP errors and cancellation cannot be inferred as success.
- Updated Call Summary to distinguish request, attempt, destination connection, human answer and missing evidence.
- Extended sales_account_intelligence with separate transfer_outcomes and evidence quotes; completed transfer attempts are not sales follow-up tasks, and caller-provided callback numbers remain unverified.
- Reload verified saved greeting, staffing and success criteria. Publication was confirmed in the version list. All four existing tools remain present: end_call and the three transfer functions. Their destinations were not edited.

These are prompt/extraction configuration improvements, not deterministic provider-event ingestion. A new call or analysis acceptance run has NOT been performed.

## Concrete blockers and findings

| Work | Result | Evidence / requirement |
|---|---|---|
| Retell prompt and extraction configuration | PASS | Saved/reloaded and published in Retell. |
| Live behavior after publication | NOT RUN | Requires a controlled test call; no new calls initiated this turn. |
| Authenticated Retell portal synchronization | BLOCKED | No RETELL environment key in existing local environment or Netlify site environment; agent-level webhook URL empty; repository has no Retell provider ingestion implementation. Secure key entry required before live verification. |
| CRM dedicated telephony field contract | BLOCKED | GET /crm/v8/settings/fields?module=Calls returns HTTP 401 OAUTH_SCOPE_MISMATCH. Asked for approval to add only ZohoCRM.settings.fields.READ; no permission expansion performed. |
| Original-caller reconciliation | BLOCKED | Retell continues receiving +18556750511 as from-number. Zoho toll-free is PSTN Forward to +16028479868; inspected form has no caller-ID preservation control. No External SIP URI profile exists. No invented SIP URI or timestamp-only match was used. |
| Duplicate recording notices | UNRESOLVED | Toll-free welcome contains recording/transcription notice. Shared titan recording profile has Always recording, Repeat Notification None, and its visible recording message is one space; profile is shared with many direct numbers. Hold profile welcome is empty and its 30-second custom announcement contains product-preparation guidance, not a recording notice. No shared recording or direct-call notice was disabled. Need controlled audio evidence identifying the remaining duplicate leg before changing notices. |
| TEST records and routing | PRESERVED | No portal/CRM write, task recreation, transfer destination edit or queue-membership change performed. |

## Preserved records

- CRM Call 6821836000027793001
- Portal Call cmugzrxut00025hlhcyeaxl0u
- Existing CRM task 6821836000027791003
- Zoho log 3437f313-1e67-4745-af19-f5f3013cc26f
- Retell call_4b75ff8b12c196612b99a3a39ed
- Human-confirmed TEST association remains human-confirmed.

## Next implementation

After secure Retell credential entry, implement authenticated exact-ID reads and signature-verified event ingestion with durable deduplication, out-of-order handling and provider-backed outcome states. Do not treat AI Call Successful or summary text as authoritative transfer completion. Link cross-provider legs only through provider identifiers or an audited human confirmation. Use a configured supported SIP endpoint if changing the PSTN route, with rollback and controlled acceptance.

After CRM metadata-read consent, inspect actual writable fields before implementing durable scoped updates to the existing call. Do not blindly write guessed field names or expose public recording URLs. Preserve existing task and Description evidence.

No outbound calls, messages, transactions, broad synchronization or new provider charges were initiated. Retell displayed $9.38 remaining and Zoho Voice 56.3467 credits; these balances are not a reconciliation of cumulative historical test spending. Keep the $100 cap and approved test recipients.

## Provider references

- https://docs.retellai.com/api-references/get-call documents exact call retrieval and tool-call transcripts.
- https://www.zoho.com/voice/help/configure-external-voice-ai-profile.html documents External SIP URI routing and SIP REFER; it does not establish an activated endpoint in this account.
- https://www.zoho.com/crm/developer/docs/api/v8/field-meta.html is the field contract inspection prerequisite.


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
