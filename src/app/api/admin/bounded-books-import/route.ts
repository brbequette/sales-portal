import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from '@/lib/zoho-auth'
import { collectBoundedBooks, redactedCounts, validateBoundedRange, type BoundedRange, type ReadTransport } from '@/lib/bounded-books-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const preflightCache = new Map<string, { at: number; counts: ReturnType<typeof redactedCounts> }>()
const keyFor = (range: BoundedRange) => `${range.startDate}:${range.endDate}`

function transport(): ReadTransport {
  return { async get(path, query) {
    const token = await getZohoAccessToken()
    const params = new URLSearchParams({ organization_id: ZOHO_ORGANIZATION_ID, ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) })
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/${path}?${params}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15_000) })
    return { status: response.status, json: () => response.json() as Promise<Record<string, unknown>> }
  } }
}

function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : 'IMPORT_FAILED'
  return ['INVALID_DATE_RANGE', 'INCOMPLETE_PAGINATION', 'REPEATED_PAGE', 'PAGE_LIMIT_EXCEEDED', 'CANCELLED'].includes(code) ? code : 'IMPORT_FAILED'
}

export async function POST(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  if (body.action === 'preflight') return preflight(body)
  if (body.action === 'import') return localImport(body, auth.session!.user.id)
  if (body.action === 'cancel') return cancel(body)
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}

async function preflight(body: Record<string, unknown>) {
  try {
    const range = validateBoundedRange(body.startDate, body.endDate)
    const collection = await collectBoundedBooks(transport(), range)
    const counts = redactedCounts(collection)
    preflightCache.set(keyFor(range), { at: Date.now(), counts })
    return NextResponse.json({ status: 'PREFLIGHT_COMPLETE', ...counts })
  } catch (error) { return NextResponse.json({ status: 'PREFLIGHT_FAILED', errorCategory: safeError(error) }, { status: 422 }) }
}

async function localImport(body: Record<string, unknown>, actorId: string) {
  let activeJobId: string | null = null
  try {
    const range = validateBoundedRange(body.startDate, body.endDate)
    if (body.confirmation !== 'IMPORT SEPTEMBER 2026' || body.readOnlyZohoConfirmation !== true) return NextResponse.json({ error: 'IMPORT_CONFIRMATION_REQUIRED' }, { status: 400 })
    const previous = preflightCache.get(keyFor(range))
    if (body.internalScheduled !== true && (!previous || Date.now() - previous.at > 15 * 60_000)) return NextResponse.json({ error: 'PREFLIGHT_REQUIRED' }, { status: 409 })
    const running = await prisma.boundedBooksImportJob.findFirst({ where: { status: 'RUNNING' } })
    if (running) return NextResponse.json({ error: 'IMPORT_ALREADY_RUNNING' }, { status: 409 })
    const job = await prisma.boundedBooksImportJob.create({ data: { actorId, startDate: range.startDate, endDate: range.endDate, status: 'RUNNING', stage: 'READ' } })
    activeJobId = job.id
    const collection = await collectBoundedBooks(transport(), range, async (event) => { await prisma.boundedBooksImportJob.update({ where: { id: job.id }, data: { stage: event.stage, heartbeatAt: new Date() } }) }, { cancelled: async () => Boolean((await prisma.boundedBooksImportJob.findUnique({ where: { id: job.id }, select: { cancelRequestedAt: true } }))?.cancelRequestedAt) })
    const ensureActive = async () => { if ((await prisma.boundedBooksImportJob.findUnique({ where: { id: job.id }, select: { cancelRequestedAt: true } }))?.cancelRequestedAt) throw new Error('CANCELLED') }
    let processed = 0
    for (const row of collection.records.invoices) {
      await ensureActive()
      const id = String(row.invoice_id || '')
      if (!id) continue
      // Account linkage is intentionally not guessed. Unmatched records are quarantined by the existing sync rules.
      const existing = await prisma.invoice.findUnique({ where: { zohoId: id }, select: { accountId: true } })
      const account = existing?.accountId ? { id: existing.accountId } : (row.customer_id ? await prisma.account.findUnique({ where: { zohoId: String(row.customer_id) }, select: { id: true } }) : null)
      if (!account?.id) continue
      await prisma.invoice.upsert({ where: { zohoId: id }, update: { status: String(row.status || 'draft'), amount: Number(row.total) || 0, balance: Number(row.balance) || 0, issueDate: row.date ? new Date(String(row.date)) : undefined, items: row as object }, create: { zohoId: id, accountId: account.id, status: String(row.status || 'draft'), amount: Number(row.total) || 0, balance: Number(row.balance) || 0, issueDate: row.date ? new Date(String(row.date)) : new Date(), items: row as object } })
      processed += 1
    }
    for (const row of collection.records.salesOrders) {
      await ensureActive()
      const id = String(row.salesorder_id || '')
      const existing = id ? await prisma.salesOrder.findUnique({ where: { zohoId: id }, select: { accountId: true } }) : null
      const account = existing?.accountId ? { id: existing.accountId } : (row.customer_id ? await prisma.account.findUnique({ where: { zohoId: String(row.customer_id) }, select: { id: true } }) : null)
      if (!account?.id) continue
      await prisma.salesOrder.upsert({ where: { zohoId: id }, update: { status: String(row.status || 'Pending'), amount: Number(row.total) || 0, orderDate: row.date ? new Date(String(row.date)) : undefined, items: row as object, lastZohoModifiedTime: row.last_modified_time ? new Date(String(row.last_modified_time)) : undefined }, create: { zohoId: id, accountId: account.id, status: String(row.status || 'Pending'), amount: Number(row.total) || 0, orderDate: row.date ? new Date(String(row.date)) : new Date(), items: row as object } })
      processed += 1
    }
    for (const row of collection.records.quotes) {
      await ensureActive()
      const id = String(row.estimate_id || '')
      const existing = id ? await prisma.quote.findUnique({ where: { zohoId: id }, select: { accountId: true } }) : null
      const account = existing?.accountId ? { id: existing.accountId } : (row.customer_id ? await prisma.account.findUnique({ where: { zohoId: String(row.customer_id) }, select: { id: true } }) : null)
      if (!account?.id) continue
      await prisma.quote.upsert({ where: { zohoId: id }, update: { status: String(row.status || 'Draft'), amount: Number(row.total) || 0, items: row as object, lastZohoModifiedTime: row.last_modified_time ? new Date(String(row.last_modified_time)) : undefined }, create: { zohoId: id, accountId: account.id, status: String(row.status || 'Draft'), amount: Number(row.total) || 0, items: row as object } })
      processed += 1
    }
    for (const row of collection.records.payments) {
      await ensureActive()
      const id = String(row.payment_id || '')
      if (!id) continue
      const invoiceId = typeof row.invoices === 'object' && Array.isArray(row.invoices) ? String((row.invoices[0] as Record<string, unknown>)?.invoice_id || '') : ''
      const invoice = invoiceId ? await prisma.invoice.findUnique({ where: { zohoId: invoiceId }, select: { id: true } }) : null
      await prisma.payment.upsert({ where: { zohoId: id }, update: { invoiceId: invoiceId || null, invoiceDbId: invoice?.id || null, invoiceNumber: String((row.invoices as Record<string, unknown>[] | undefined)?.[0]?.invoice_number || '') || null, amount: Number(row.amount) || 0, date: row.date ? new Date(String(row.date)) : null, mode: String(row.payment_mode || '') || null, status: String(row.payment_status || row.status || '') || null, referenceNumber: String(row.reference_number || '') || null, bankCharges: Number(row.bank_charges) || 0, description: null }, create: { zohoId: id, invoiceId: invoiceId || null, invoiceDbId: invoice?.id || null, invoiceNumber: null, amount: Number(row.amount) || 0, date: row.date ? new Date(String(row.date)) : null, mode: String(row.payment_mode || '') || null, status: String(row.payment_status || row.status || '') || null, referenceNumber: String(row.reference_number || '') || null, bankCharges: Number(row.bank_charges) || 0, description: null } })
      processed += 1
    }
    await prisma.boundedBooksImportJob.update({ where: { id: job.id }, data: { status: 'COMPLETE', stage: 'COMPLETE', processed, succeeded: processed, total: Object.values(collection.counts).reduce((a, b) => a + b, 0), completedAt: new Date(), heartbeatAt: new Date() } })
    return NextResponse.json({ status: 'COMPLETE', jobId: job.id, counts: redactedCounts(collection) })
  } catch (error) {
    if (activeJobId) await prisma.boundedBooksImportJob.update({ where: { id: activeJobId }, data: { status: safeError(error) === 'CANCELLED' ? 'CANCELLED_PARTIAL' : 'FAILED', errorCategory: safeError(error), completedAt: new Date(), heartbeatAt: new Date() } }).catch(() => undefined)
    return NextResponse.json({ status: safeError(error) === 'CANCELLED' ? 'CANCELLED_PARTIAL' : 'IMPORT_FAILED', errorCategory: safeError(error) }, { status: 422 })
  }
}

async function cancel(body: Record<string, unknown>) {
  const id = typeof body.jobId === 'string' ? body.jobId : ''
  if (!id) return NextResponse.json({ error: 'JOB_ID_REQUIRED' }, { status: 400 })
  const job = await prisma.boundedBooksImportJob.update({ where: { id }, data: { cancelRequestedAt: new Date(), status: 'CANCELLED_PARTIAL', completedAt: new Date() } })
  return NextResponse.json({ status: job.status, jobId: job.id })
}

export async function GET(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const id = req.nextUrl.searchParams.get('jobId')
  const job = id ? await prisma.boundedBooksImportJob.findUnique({ where: { id } }) : await prisma.boundedBooksImportJob.findFirst({ orderBy: { startedAt: 'desc' } })
  return NextResponse.json(job ? { jobId: job.id, status: job.status, stage: job.stage, total: job.total, processed: job.processed, succeeded: job.succeeded, skipped: job.skipped, failed: job.failed, cancelRequested: Boolean(job.cancelRequestedAt), errorCategory: job.errorCategory } : { status: 'IDLE' })
}
