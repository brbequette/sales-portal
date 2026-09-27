// Operational conclusions are calculated from validated records, not generated
// from transcript prose. Missing evidence must never silently become zero.
type Row = { count: number; status?: string | null }
type Snapshot = {
  checkedAt: string; windowStart: string; reportType?: string; overdueTasks: number
  calls: Row[]; messages: Row[]; communicationEvents: Row[]; operationalJobs: Row[]
  alertWindow: { start: string; end: string; failedJobs: number; undeliveredMessages: number }
  samples: { overdueTasks: Array<{ id: string; subject: string; dueDate: string | Date }> }
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const date = (value: unknown) => (typeof value === 'string' || value instanceof Date) && Number.isFinite(new Date(value).getTime())
export function timestampPair(value: string | Date) {
  const utc = new Date(value).toISOString()
  return `${utc} UTC / ${new Date(new Date(value).getTime() - 7 * 3600000).toISOString().slice(0, 19)}-07:00 America/Phoenix`
}
function valid(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false
  const r = value as Snapshot
  const rows = [r.calls, r.messages, r.communicationEvents, r.operationalJobs]
  return date(r.checkedAt) && date(r.windowStart) && new Date(r.windowStart) < new Date(r.checkedAt) && count(r.overdueTasks)
    && rows.every(a => Array.isArray(a) && a.every(x => x && count(x.count) && (x.status == null || typeof x.status === 'string')))
    && !!r.alertWindow && date(r.alertWindow.start) && date(r.alertWindow.end)
    && count(r.alertWindow.failedJobs) && count(r.alertWindow.undeliveredMessages)
    && !!r.samples && Array.isArray(r.samples.overdueTasks)
    && r.samples.overdueTasks.every(t => t && typeof t.id === 'string' && typeof t.subject === 'string' && date(t.dueDate))
}
const total = (rows: Row[]) => rows.reduce((sum, row) => sum + row.count, 0)
const failures = (rows: Row[]) => total(rows.filter(row => ['FAILED', 'DEAD_LETTER', 'UNDELIVERED'].includes(String(row.status).toUpperCase())))
const clean = (text: string, max: number) => text.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, max)

export const monitoringContract = 'Monitoring checks every 15 minutes, not continuously. Each review counts the previous 24 hours of recorded calls, texts, communication-event metadata and non-Telegram processing jobs, plus all currently open overdue tasks regardless of age. Categories overlap; they are not unique interactions. Content samples are at most 8 calls, 8 texts and 8 oldest overdue tasks. Unrecorded clicks, external conversations, email bodies, payroll and private chats are not observed.\n\nDaily digest: at or after 8 AM America/Phoenix (UTC-7). Urgent threshold alerts: any hour, including before 8 AM, when at least 3 failed/dead-letter non-Telegram jobs were updated OR 3 failed/undelivered texts were created in the last completed 15-minute interval. Queue latency may delay delivery. Zero rows do not prove missed logging or an integration fault.\n\nUse /monitor status to check your subscription, /monitor off to stop, and /report for a current evidence-based review. I can read, analyze, draft and recommend. Approval only enables existing supported task/flyer actions; it does not add tools to edit thresholds, expand coverage or deploy application changes.'

export function isMonitoringQuestion(text: string) {
  return /\b(monitor(?:ing)?|urgent|digest)\b/i.test(text) && /\b(coverage|lookback|threshold|frequency|every.*click|before 8|after 8|time zone|timezone|approval alone|stop monitoring)\b/i.test(text)
}
export function isActivityReview(text: string) {
  if (/\b(hypothetical|consult|draft|create|complete|send)\b/i.test(text)) return false
  return /\b(review|audit|assess|analy[sz]e)\b[\s\S]{0,90}\b(recorded activity|operational activity|recorded interactions)\b/i.test(text)
    || /\b(oldest overdue task|empty.{0,35}(call|message).{0,25}window)\b/i.test(text)
    || /\b(process|workflow|interface) improvements\b/i.test(text) && /\b(recorded|current|activity|evidence)\b/i.test(text)
}

export function renderInteractionReport(value: unknown) {
  if (!valid(value)) return 'I could not validate the monitoring snapshot. Missing data is not zero activity. No operational conclusions or changes were made. Use /report to request a fresh check.'
  const r = value
  const failedJobs = failures(r.operationalJobs), failedTexts = failures(r.messages)
  const urgent = r.alertWindow.failedJobs >= 3 || r.alertWindow.undeliveredMessages >= 3
  const title = r.reportType === 'daily' ? 'Daily monitoring digest' : r.reportType === 'hourly' ? 'Hourly monitoring report' : r.reportType === 'alert' ? 'Threshold monitoring report' : 'Recorded-activity review'
  const lines = [title, `Checked: ${timestampPair(r.checkedAt)}`, `Window starts: ${timestampPair(r.windowStart)}`, '',
    `Recorded rows: calls ${total(r.calls)}; texts ${total(r.messages)}; communication events ${total(r.communicationEvents)}; non-Telegram jobs ${total(r.operationalJobs)}. Categories can overlap.`,
    `Open overdue tasks: ${r.overdueTasks} (all ages). Failed/dead-letter jobs in window: ${failedJobs}; failed/undelivered texts: ${failedTexts}.`,
    `Alert interval (UTC): ${r.alertWindow.start} to ${r.alertWindow.end}. Failed jobs ${r.alertWindow.failedJobs}; undelivered texts ${r.alertWindow.undeliveredMessages}. ${urgent ? 'Urgent threshold met.' : 'No urgent threshold met.'}`, '', 'Supported next steps:']
  if (r.overdueTasks > 0) {
    lines.push(`1. Review the ${r.overdueTasks} open overdue tasks in the existing Follow-up queue. Confirm completion evidence, owner and next due date before any status change. An open status does not prove the work was never done. Metric: open overdue count and age, compared at the next review.`)
    const oldest = [...r.samples.overdueTasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
    if (oldest) lines.push(`Oldest sampled task: ${clean(oldest.subject, 90)} [${clean(oldest.id, 70)}]. Due: ${timestampPair(oldest.dueDate)}.`)
  }
  if (failedJobs > 0) lines.push(`- Investigate ${failedJobs} recorded failed/dead-letter jobs in the existing operations/system-health screens. Check exact errors and provider outcomes before retrying. Metric: unresolved failed jobs after review; no automatic replay.`)
  if (failedTexts > 0) lines.push(`- Review ${failedTexts} failed/undelivered text records in Messages. Verify provider delivery status before contacting anyone again. Metric: unresolved delivery failures; no automatic resend.`)
  if (!r.overdueTasks && !failedJobs && !failedTexts) lines.push('No process defect is established by these aggregate records. No improvement is asserted merely to fill a list.')
  lines.push('', 'Existing app: the operations workbench already has Follow-up, failure filters, owners/deadlines and a 30-day scorecard. Its window differs from this review.',
    'https://www.tdusales.com/admin/operations-workbench',
    'Empty activity or successful jobs do not establish missed logging, missing status visibility or a broken integration. UI/design gaps require inspecting the actual workflow; none are asserted from these counts.',
    'Coverage: recorded rows only; content samples at most 8 calls, 8 texts and 8 oldest tasks. This aggregate report does not analyze conversation content. No changes or customer sends performed.')
  return lines.join('\n')
}
