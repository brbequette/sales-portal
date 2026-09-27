# Titan Admin & Architect

Use `/system` for the main assistant, `/agents` for the specialist roster, and
`/directions` for its operating instructions. Administrators can request up to
two read-only specialist consultations in one question. These are bounded model
consultations, not independent background workers. Their findings return to the
main assistant; they cannot execute actions. Existing task/flyer approval flows
remain the mechanism for supported changes.

Telegram OpenAI completions use `gpt-4.1` by default, configurable through
`TELEGRAM_OPENAI_MODEL`. This override affects Telegram only; the existing provider
chain and other application model settings stay in effect. Both answer generation
and final verification apply evidence rules: zero rows do not establish broken
logging or missed work, digests are not automatically alerts, and recommendations
cannot change monitoring coverage or thresholds. Report evidence carries its actual
daily/hourly/alert delivery type. Live answer quality still requires evaluation;
passing mocked tests does not prove factual accuracy.

## Telegram monitoring

An administrator enables `/monitor daily` in the paired private Telegram chat.
This selects a digest at or after 8 AM America/Phoenix and threshold alerts sooner.
`/monitor status` reports the configuration; `/monitor off` stops future reports,
including queued reports checked before delivery. `/monitor alerts` and
`/monitor hourly` are alternatives. Re-pairing or loss of administrator access
invalidates the subscription. This is not a grant of administrator permissions.

The scheduled `telegram-admin-monitor` function runs every 15 minutes. Checks and
deliveries have stable idempotency keys, with one claimed review per subscriber
per interval and one daily/hourly digest per period. Daily digests carry an alert
from the same check; later intervals can still send distinct urgent alerts.
The subscriber scan is bounded to 50 settings per run. Telegram's existing queue
adds delivery latency. Ambiguous delivery is not automatically replayed.

Checks aggregate the previous 24 hours of recorded calls, SMS, communication-event
metadata and non-Telegram operational job outcomes, plus open overdue tasks.
Content analysis uses eight recent call transcripts, eight recent text messages,
and eight oldest overdue tasks. These categories can overlap; their counts must
not be added as unique interactions. Transcript/message excerpts are bounded.
Unrecorded UI clicks, external conversations, email bodies, payroll and private
chats are not observed. Interface recommendations are hypotheses unless backed
by recorded evidence; the bot does not inspect live screenshots.

The initial operational alert threshold is three failed/dead-letter jobs updated
or three failed/undelivered SMS rows created in the last completed 15-minute
interval. This is a warning threshold, not comprehensive incident detection.
Monitoring produces recommendations with evidence, impact, a proposed change,
and a validation metric. Scheduled reviews cannot propose or execute actions,
delegate work, edit the app, or send customer messages. Reports go only to the
subscribed administrator's still-valid paired Telegram chat.

No database migration is required. SystemSetting stores subscriptions;
OperationalAction stores check audits and queued reports. Disabling monitoring
does not erase the operational audit history.
