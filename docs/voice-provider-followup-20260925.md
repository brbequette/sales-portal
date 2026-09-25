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
