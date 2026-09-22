# SMS/MMS send-surface inventory

All runtime sends normalize and consult `guardSmsSend` immediately before provider submission. Protected opt-out/legal suppression blocks every traffic class. Technical suppression blocks promotional/test traffic and can only be bypassed for a single transactional send with a verified administrator ID, explicit reason, and immutable `PhoneDeliverabilityReview` audit row.

| Entry point | Authentication | Traffic | Guard/enforcement | Audit |
|---|---|---|---|---|
| `campaign-worker` | Admin-created durable job; server watchdog | Promotional SMS/MMS | Protected + technical, checked again after atomic claim | Recipient, attempt, campaign log, SMS message |
| `campaign-job-create` | Administrator | Promotional | Preflight and durable recipient materialization; its old helper is unreachable and retained only pending deletion | Recipient rows |
| `send-campaign` | Administrator | Legacy promotional | Retired with HTTP 410; cannot send | None |
| `process-scheduled-messages` | Netlify scheduler | Promotional when blast-linked; otherwise transactional | Shared guard; guarded failures persisted | Scheduled message and campaign log |
| `campaign-job/test-send` / MMS Canary | Administrator | Test | Shared protected + technical guard both during confirmation preflight and at submission | Provider result; suppression decision displayed |
| `send-sms` | Authenticated, owner/manager scope | Transactional | Shared guard; protected and technical restrictions enforced | SMS message and communication event |
| `/api/messages/[accountId]` | Authenticated account ownership | Transactional | Shared guard | SMS message |
| `zoho-voice` `SEND_SMS` | Authenticated account action | Transactional | Shared guard | Account note |
| Customer magic-link OTP | Public request after matching local customer | Legally necessary authentication | Shared guard; no opt-out/legal exception is claimed, so protected suppression blocks | Existing authentication audit path |
| `ping_all.ts` | No deployed handler/export | Developer diagnostic only | Not a callable runtime surface; must never be run against production | Console diagnostic only |
| Automation engine / collections UI | Authenticated internal workflows | No independent provider endpoint found | They converge through the guarded messaging routes | Underlying route audit |

Provider delivery callbacks enter `zoho-voice-status`; they never send. The bounded reconciliation worker never sends probes and never retries failed or ambiguous marketing traffic.
