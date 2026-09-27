import { createHash } from 'node:crypto'
import { Prisma, type Invoice } from '@prisma/client'
import { prisma } from './prisma'
import { buildInvoiceUpdateData } from './sync-engine'
import { ZOHO_DC, ZOHO_ORGANIZATION_ID } from './zoho-auth'

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)]))
  return v
}
const fingerprint = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(json(v)))).digest('hex')
const include = { account: true, deal: true, dealSyncJob: true } as const
type Snapshot = Prisma.InvoiceGetPayload<{ include: typeof include }>

function eligible(row: Snapshot) {
  const evidence = object(object(row.deal?.rawData)._portalSync)
  if (row.syncConflict || row.pendingZohoFetch || !row.deal || row.deal.accountId !== row.accountId || !row.account.crmAccountId
    || !row.dealSyncJob?.checkedAt || row.dealSyncJob.checkedAt < row.dealSyncJob.changedAt
    || row.dealSyncJob.lastError || (row.dealSyncJob.leaseUntil && row.dealSyncJob.leaseUntil > new Date())
    || evidence.state !== 'SYNCED' || evidence.ownerEvidence !== 'EXACT_INVOICE_SALESPERSON') throw Error('INVOICE_HOLD')
}

/** Only date/link metadata may change. No cost, payment, status, owner or line-item calculations. */
export function targetedInvoicePatch(row: Invoice, provider: Record<string, unknown>, customerId: string, crmId: string) {
  if (provider.invoice_id !== row.zohoId || provider.customer_id !== customerId) throw Error('PROVIDER_IDENTITY_MISMATCH')
  for (const key of ['date', 'due_date']) {
    const value = provider[key]
    if (key === 'date' && !value) throw Error('PROVIDER_DATE_REQUIRED')
    if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw Error('PROVIDER_DATE_INVALID')
  }
  const potential = provider.zcrm_potential_id
  if (potential && potential !== crmId) throw Error('PROVIDER_LINK_MISMATCH')
  const existing = object(row.items)
  // A missing provider link cannot erase an existing authoritative association.
  const rawPotential = object(row.rawData).zcrm_potential_id
  if ((existing.zcrm_potential_id && existing.zcrm_potential_id !== potential) || (rawPotential && rawPotential !== potential)) throw Error('PROVIDER_LINK_MISMATCH')
  const merged = buildInvoiceUpdateData({ existingItems: row.items, zohoDoc: provider, calcItems: {}, conflictResult: { hasConflict: false, fields: {} }, paymentSummary: { paymentExpected: row.paymentExpected, balance: row.balance, lastPaymentDate: row.lastPaymentDate } })
  const dates = object(merged.items)
  const items = { ...existing, date: dates.date, due_date: dates.due_date, ...(potential ? { zcrm_potential_id: potential, ...(typeof provider.zcrm_potential_name === 'string' ? { zcrm_potential_name: provider.zcrm_potential_name } : {}) } : {}) }
  return { issueDate: merged.issueDate as Date, dueDate: merged.dueDate as Date | null, items: json(items) }
}

export async function refreshTargetedInvoice(booksId: string, expectedUpdatedAt: string, actorId: string) {
  if (!/^\d{15,20}$/.test(booksId) || !/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw Error('INVALID_REFRESH_REQUEST')
  const revision = new Date(expectedUpdatedAt).toISOString()
  const key = `BOOKS_INVOICE_METADATA:${booksId}:${revision}`
  const previous = await prisma.operationalAction.findUnique({ where: { idempotencyKey: key } })
  if (previous) {
    if (previous.status !== 'SUCCEEDED') throw Error('REFRESH_ALREADY_CLAIMED')
    const current = await prisma.invoice.findUnique({ where: { zohoId: booksId } })
    if (!current || fingerprint(current) !== object(previous.result).afterHash) throw Error('REFRESH_READBACK_CHANGED')
    return { state: 'SUCCEEDED', replay: true, providerCalls: 0, invoiceId: current.id, dueDate: current.dueDate }
  }
  const before = await prisma.invoice.findUnique({ where: { zohoId: booksId }, include })
  if (!before || before.updatedAt.toISOString() !== revision) throw Error('INVOICE_REVISION_CHANGED')
  eligible(before)
  if (await prisma.providerWriteOperation.count({ where: { entityId: { in: [before.id, before.deal!.id] }, state: { not: 'SUCCEEDED' } } })) throw Error('PROVIDER_WRITE_HOLD')
  // Use an already-valid cache: this route never hides extra OAuth requests or retries.
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_token_cache' } })
  const token = object(setting ? JSON.parse(setting.value) : null)
  if (typeof token.token !== 'string' || Number(token.expiresAt) < Date.now() + 30000) throw Error('FRESH_TOKEN_REQUIRED')
  const operation = await prisma.operationalAction.create({ data: { idempotencyKey: key, actionType: 'BOOKS_INVOICE_METADATA_REFRESH', entityType: 'invoice', entityId: before.id, status: 'RUNNING', maxAttempts: 1, attemptCount: 1, startedAt: new Date(), actorId, payload: json({ before, providerCallsReserved: 1 }) } })
  try {
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${booksId}?organization_id=${ZOHO_ORGANIZATION_ID}`, { headers: { Authorization: `Zoho-oauthtoken ${token.token}` }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw Error(`BOOKS_HTTP_${response.status}`)
    const body = object(await response.json())
    if (body.code !== 0) throw Error('BOOKS_RESPONSE_INVALID')
    const provider = object(body.invoice)
    const patch = targetedInvoicePatch(before, provider, before.account.booksCustomerId || before.account.zohoId || '', before.deal?.zohoId || '')
    await prisma.$transaction(async tx => {
      const current = await tx.invoice.findUnique({ where: { id: before.id }, include })
      if (!current || fingerprint(current) !== fingerprint(before)) throw Error('INVOICE_REVISION_CHANGED')
      eligible(current)
      if (await tx.providerWriteOperation.count({ where: { entityId: { in: [before.id, before.deal!.id] }, state: { not: 'SUCCEEDED' } } })) throw Error('PROVIDER_WRITE_HOLD')
      const write = await tx.invoice.updateMany({ where: { id: before.id, updatedAt: before.updatedAt }, data: patch })
      if (write.count !== 1) throw Error('INVOICE_REVISION_CHANGED')
      const after = await tx.invoice.findUniqueOrThrow({ where: { id: before.id } })
      const invoiceBefore = Object.fromEntries(Object.entries(before).filter(([key]) => !['account', 'deal', 'dealSyncJob'].includes(key)))
      const expected = { ...invoiceBefore, ...patch, updatedAt: after.updatedAt }
      if (fingerprint(after) !== fingerprint(expected)) throw Error('FINANCIAL_INVARIANT_FAILED')
      await tx.operationalEvent.create({ data: { entityType: 'invoice', entityId: before.id, eventType: 'BOOKS_INVOICE_METADATA_REFRESHED', title: 'Authoritative Books invoice metadata refreshed', actorId, metadata: json({ operationId: operation.id, before: invoiceBefore, afterHash: fingerprint(after), provider: { invoice_id: provider.invoice_id, customer_id: provider.customer_id, date: provider.date, due_date: provider.due_date, zcrm_potential_id: provider.zcrm_potential_id }, providerCalls: 1 }) } })
      await tx.operationalAction.update({ where: { id: operation.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), result: json({ afterHash: fingerprint(after), providerCalls: 1 }) } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 })
    const [after, saved] = await Promise.all([prisma.invoice.findUniqueOrThrow({ where: { id: before.id } }), prisma.operationalAction.findUniqueOrThrow({ where: { id: operation.id } })])
    if (fingerprint(after) !== object(saved.result).afterHash) throw Error('REFRESH_READBACK_CHANGED')
    return { state: 'SUCCEEDED', replay: false, providerCalls: 1, invoiceId: after.id, dueDate: after.dueDate }
  } catch (error) {
    await prisma.operationalAction.updateMany({ where: { id: operation.id, status: 'RUNNING' }, data: { status: 'FAILED', completedAt: new Date(), errorCode: 'REFRESH_REQUIRES_REVIEW' } })
    throw error
  }
}
