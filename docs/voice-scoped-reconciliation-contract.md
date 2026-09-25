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

## Review follow-up
- Manual apply now resolves the exact account-match exception and moves source-linked commitment associations atomically. Local replay reports CRM verification NOT_CHECKED rather than incorrectly declaring an already-synced call incomplete.
- CRM-only administrator endpoint tests added (47 focused mocked tests total). Disposable PostgreSQL lock/rollback tests, complete migration chain and upgrade rehearsal passed in GitHub run 36139154048.
- Live CRM read-only preflight: exact source-subject search HTTP 204; existing native call readback confirmed Call_Duration 00:07 means 7 seconds. The exact TEST transcript returned four matching segments via transcribeObj.transcriptJson. Recording buffer limit reduced to 4 MiB for bounded serverless playback.

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
