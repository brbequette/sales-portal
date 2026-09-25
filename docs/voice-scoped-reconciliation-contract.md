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

## Implementation status update
Scoped preview/apply routes, administrator UI and protected recording retrieval are now implemented locally. Twenty focused tests passed. The earlier statement that no scoped route exists is superseded by this section.

Still release-blocking: database integration tests covering concurrent bulk/webhook versus manual apply; durable CRM Calls provider writes and ambiguity reconciliation; actual provider recording filename/authorization validation; build/function checks and independent production verification. The provider filename may be absent in a single-call response; absence is deliberately blocked rather than fabricated. Retell reference remains human-confirmed, not an independently fetched Retell record.

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
