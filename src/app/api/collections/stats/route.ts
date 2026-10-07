import { NextResponse } from 'next/server'
import { authenticateRequest } from '../../../../../netlify/functions/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/roles'
import { attributeReceipts, collectionDay, legacyCollectionCall, isLegacyCollectionCall, reportSettings, type CollectionActivity, type CollectionReceipt } from '@/lib/collections-stats'

const headers = { 'Cache-Control': 'private, no-store' }
async function identity(req: Request) {
  const auth = await authenticateRequest(req)
  return prisma.user.findFirst({ where: { OR: [
    ...(auth.dbId ? [{ id: auth.dbId }] : []), ...(auth.userId ? [{ id: auth.userId }] : []),
    ...(auth.email ? [{ email: { equals: auth.email, mode: 'insensitive' as const } }] : []),
  ] }, select: { id: true, email: true, role: true } })
}
export async function GET(req: Request) {
  let user
  try { user = await identity(req) } catch { return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers }) }
  if (!user) return NextResponse.json({ error: 'Access unavailable' }, { status: 403, headers })
  try {
    const params = new URL(req.url).searchParams
    const start = params.get('start') || '', end = params.get('end') || ''
    const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
    if (!validDate(start) || !validDate(end) || start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000) return NextResponse.json({ error: 'Choose a valid date range of up to one year.' }, { status: 400, headers })
    const [manager, setting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'collections_manager_id' } }),
      prisma.systemSetting.findUnique({ where: { key: 'collections_report_settings' } }),
    ])
    const settings = reportSettings(setting?.value)
    const company = isAdminRole(user.role) || manager?.value === user.id || user.email.toLowerCase() === 'brian@titandiamond.net'
    const accountScope = company ? {} : { ownerId: user.id }
    const from = new Date(Date.parse(start + 'T07:00:00Z') - settings.attributionDays * 86400000)
    const until = new Date(Date.parse(end + 'T07:00:00Z') + 86400000)
    const [events, notes, invoices] = await Promise.all([
      prisma.communicationEvent.findMany({ where: { eventType: 'collection_call', occurredAt: { gte: from, lt: until }, account: accountScope }, include: { account: { select: { name: true } }, actor: { select: { name: true } } }, take: 20001 }),
      prisma.note.findMany({ where: { createdAt: { gte: from, lt: until }, content: { startsWith: '📞 Collection Call —' }, account: accountScope }, include: { account: { select: { name: true } }, author: { select: { name: true } } }, take: 20001 }),
      prisma.invoice.findMany({ where: { account: accountScope, dueDate: { lt: until }, status: { notIn: ['Void', 'void', 'Voided', 'voided', 'Draft', 'draft', 'Deleted', 'deleted', 'Orphaned', 'orphaned'] } }, select: { id: true, zohoId: true, invoiceNumber: true, dueDate: true, accountId: true, account: { select: { name: true } } }, take: 20001 }),
    ])
    if ([events, notes, invoices].some(rows => rows.length > 20000)) throw new Error('Report too large. Choose a shorter range or contact an administrator.')
    const sourceIds = new Set(events.map(e => e.sourceId))
    const calls: CollectionActivity[] = events.map<CollectionActivity>(e => {
      const m = e.metadata as any || {}
      return { id: e.sourceId, accountId: e.accountId, account: e.account.name, actorId: e.actorId || '', actor: e.actor?.name || 'Staff', date: e.occurredAt.toISOString(),
        outcome: m.outcome || 'Unknown', reached: m.contactReached === true, minutes: typeof m.durationMinutes === 'number' ? m.durationMinutes : null,
        invoiceIds: Array.isArray(m.invoiceIds) ? m.invoiceIds : [], promiseDate: m.promiseDate, followUpDate: m.followUpDate, legacy: false }
    }).concat(notes.filter(n => !sourceIds.has(n.id) && isLegacyCollectionCall(n.content)).map(legacyCollectionCall))
    const payments = invoices.length ? await prisma.payment.findMany({ where: {
      date: { gte: new Date(start + 'T00:00:00Z'), lt: until }, OR: [{ invoiceDbId: { in: invoices.map(i => i.id) } }, { invoiceId: { in: invoices.map(i => i.zohoId) } }],
    }, select: { id: true, invoiceDbId: true, invoiceId: true, amount: true, date: true, status: true }, take: 20001 }) : []
    if (payments.length > 20000) throw new Error('Too many payments. Choose a shorter date range.')
    const byId = new Map(invoices.map(i => [i.id, i])), byZoho = new Map(invoices.map(i => [i.zohoId, i]))
    const receipts: CollectionReceipt[] = []
    let excludedPayments = 0
    for (const payment of payments) {
      const invoice = byId.get(payment.invoiceDbId || '') || byZoho.get(payment.invoiceId || '')
      // Provider accounting dates are dates, not the moment of a phone call.
      const day = payment.date?.toISOString().slice(0, 10)
      const due = invoice?.dueDate?.toISOString().slice(0, 10)
      if (!invoice || !day || !due || day < start || day > end || day <= due) continue
      if (payment.amount <= 0 || (payment.status && !['paid', 'success', 'succeeded', 'completed', 'cleared', 'received'].includes(payment.status.toLowerCase()))) { excludedPayments++; continue }
      receipts.push({ id: payment.id, invoiceId: invoice.id, invoice: invoice.invoiceNumber || invoice.zohoId, accountId: invoice.accountId, account: invoice.account.name, date: day, amount: payment.amount, dueDate: due })
    }
    const attributed = attributeReceipts(receipts, calls, settings.attributionDays)
    const plans = await prisma.compensationPlan.findMany({ where: {
      repId: { in: isAdminRole(user.role) ? [...new Set(calls.map(c => c.actorId))] : [user.id] },
      status: { in: ['ACTIVE', 'ENDED'] }, startDate: { lt: until }, OR: [{ endDate: null }, { endDate: { gte: from } }],
    }, select: { id: true, repId: true, name: true, startDate: true, endDate: true, payType: true, baseAmount: true, baseInterval: true } })
    return NextResponse.json({ settings, canEdit: isAdminRole(user.role), company, managerId: manager?.value || null,
      collectors: [...new Map(calls.map(c => [c.actorId, c.actor])).entries()],
      plans, userId: user.id,
      calls: calls.filter(c => collectionDay(c.date) >= start && collectionDay(c.date) <= end), receipts: attributed,
      excludedPayments, generatedAt: new Date().toISOString() }, { headers })
  } catch (error) {
    console.error('Collections report unavailable', error)
    const message = error instanceof Error && /^(Report too large|Too many payments)/.test(error.message) ? error.message : 'Could not load collections statistics. Please retry.'
    return NextResponse.json({ error: message }, { status: 500, headers })
  }
}
export async function PUT(req: Request) {
  let user
  try { user = await identity(req) } catch { return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers }) }
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Administrator access required' }, { status: 403, headers })
  let settings
  try { settings = reportSettings(JSON.stringify(await req.json())) } catch { return NextResponse.json({ error: 'Enter valid whole-number goals and an attribution window from 1 to 365 days.' }, { status: 400, headers }) }
  try {
    await prisma.systemSetting.upsert({ where: { key: 'collections_report_settings' }, create: { key: 'collections_report_settings', value: JSON.stringify(settings) }, update: { value: JSON.stringify(settings) } })
    return NextResponse.json({ settings }, { headers })
  } catch { return NextResponse.json({ error: 'Could not save reporting settings. Please retry.' }, { status: 500, headers }) }
}
