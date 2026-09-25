# Native voice synchronization release gates

Existing production follow-up: CRM task 6821836000027791003. Preserve it.

Authoritative API contracts checked:
- https://www.zoho.com/voice/api/get-a-call-log.html - GET /rest/json/zv/logs/{logId}; inspect returned logs for exact requested ID, reject missing/duplicate matches and errors, never take first record implicitly.
- https://www.zoho.com/voice/api/get-transcription-details.html - GET /rest/json/zv/transcribe with logId and transcriptionType=2. transcribeObj contains transcriptJson. Do not persist JSON analysis as transcript evidence.
- https://www.zoho.com/voice/api/get-recording-voicemail.html - recording download requires provider-returned recording_filename and authorized Voice OAuth; do not guess file names. mode=Play is supported. Scope ZohoVoice.call.READ. Documented limit 30 requests/minute with 10-minute lock period.

Required before release:
1. Authenticated administrator-only preview/apply bound to actor, exact provider IDs, local account/contact, existing source version and explicit human association reason. Expiring preview and stale-state rejection.
2. Exact-ID provider reads only. Validate timestamps, direction and provider status without defaulting unknown outcomes to success. Retell-to-Zoho association remains manually confirmed unless provider correlation proves it.
3. Atomic source-ID upsert with append-only audit, replay/concurrency protection and preservation of manual mappings against bulk sync/webhook replays. Never update unrelated records.
4. Preserve existing CRM task and reference it. CRM Calls writes require durable provider-operation handling and reconciliation for ambiguous outcomes; no blind retry.
5. Store recordings behind authenticated account/role authorization; never expose tokens, arbitrary fetch URLs or public recording links. Require authoritative filename evidence.
6. Keep outbound effects disabled. UI preview must expose changes, pending/success/failure and native/provider persistence independently. No automated account fact overwrite from uncertain transcript.
7. Test provider rejection, malformed/wrong/multiple IDs, stale preview, duplicate/out-of-order deliveries, concurrency, unknown direction, business numbers, ambiguous identity, missing transcripts/recordings and denied playback. Run migration/build/function checks as applicable, PR review, controlled deploy and independent portal/CRM verification.

Local implemented scope only: callback replay safeguards and transcript parser; no scoped import route, preview UI, recording proxy or native CRM Calls write has been implemented yet.
