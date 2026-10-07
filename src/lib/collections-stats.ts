export const DEFAULT_COLLECTIONS_REPORT_SETTINGS = { attributionDays: 30, dailyCallGoal: 30, monthlyRecoveryGoal: 25000 }
export type CollectionsReportSettings = typeof DEFAULT_COLLECTIONS_REPORT_SETTINGS
export function reportSettings(value?: string | null): CollectionsReportSettings {
  if (!value) return { ...DEFAULT_COLLECTIONS_REPORT_SETTINGS }
  const parsed = JSON.parse(value)
  for (const [key, max] of [['attributionDays', 365], ['dailyCallGoal', 1000], ['monthlyRecoveryGoal', 100000000]] as const) {
    if (!Number.isFinite(parsed[key]) || parsed[key] < (key === 'attributionDays' ? 1 : 0) || parsed[key] > max || !Number.isInteger(parsed[key])) throw new Error('Invalid collections reporting settings')
  }
  return { attributionDays: parsed.attributionDays, dailyCallGoal: parsed.dailyCallGoal, monthlyRecoveryGoal: parsed.monthlyRecoveryGoal }
}
// Date-only accounting dates retain their date. Timestamps use the company's Arizona calendar.
export function collectionDay(value: Date | string) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function collectionPeriod(day: string, period: string) {
  if (period === 'monthly') return day.slice(0, 7)
  if (period !== 'weekly') return day
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
  return d.toISOString().slice(0, 10)
}
export type CollectionActivity = { id: string; accountId: string; account: string; actorId: string; actor: string; date: string; outcome: string; reached: boolean; minutes: number | null; invoiceIds: string[]; promiseDate?: string; followUpDate?: string; legacy: boolean }
export type CollectionReceipt = { id: string; invoiceId: string; invoice: string; accountId: string; account: string; date: string; amount: number; dueDate: string; collector?: string; callId?: string }
export function attributeReceipts(receipts: CollectionReceipt[], calls: CollectionActivity[], days: number) {
  return receipts.map(receipt => {
    const eligible = calls.filter(call => !call.legacy && call.reached && call.accountId === receipt.accountId && call.invoiceIds.includes(receipt.invoiceId)
      && collectionDay(call.date) < receipt.date && new Date(receipt.date).getTime() - new Date(collectionDay(call.date)).getTime() <= days * 86400000)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    return { ...receipt, collector: eligible[0]?.actorId, callId: eligible[0]?.id }
  })
}
export function legacyCollectionCall(note: any): CollectionActivity {
  const line = (name: string) => String(note.content).split('\n').find((s: string) => s.startsWith(name))?.slice(name.length).trim()
  const duration = Number.parseFloat(line('Duration:') || '')
  return { id: note.id, accountId: note.accountId, account: note.account.name, actorId: note.authorId, actor: note.author.name || 'Staff', date: note.createdAt.toISOString(),
    outcome: line('Outcome:') || 'Unknown', reached: !!line('Spoke With:'), minutes: Number.isFinite(duration) && duration >= 0 ? duration : null,
    invoiceIds: [], promiseDate: line('Promise to Pay by:'), followUpDate: line('Follow-up:'), legacy: true }
}
