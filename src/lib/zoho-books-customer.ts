import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

const ZOHO_DC = process.env.ZOHO_DC?.trim() || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID?.trim() || ''
const TIMEOUT_MS = 15000

type BooksCustomerResult = {
  state: 'SUCCEEDED' | 'SYNCING' | 'FAILED' | 'AMBIGUOUS'
  booksCustomerId?: string
  code?: string
  message?: string
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function findByCrmAccountId(crmAccountId: string, token: string): Promise<string | null> {
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/contacts?organization_id=${encodeURIComponent(ORG_ID)}&zcrm_account_id=${encodeURIComponent(crmAccountId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null)
  const exact = (body?.contacts || []).filter((contact: any) => String(contact?.zcrm_account_id || '') === crmAccountId)
  return exact.length === 1 ? String(exact[0].contact_id || '').trim() || null : null
}

async function persistBooksCustomer(accountId: string, operationKey: string, booksCustomerId: string, code: string, message: string) {
  await prisma.$transaction([
    prisma.account.update({ where: { id: accountId }, data: { booksCustomerId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } }),
    prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', providerRecordIds: { booksCustomerId }, providerCode: code, providerMessage: message, completedAt: new Date(), lastError: null, nextAttemptAt: null } }),
  ])
  return { state: 'SUCCEEDED', booksCustomerId, code, message } as const
}

/**
 * Resolve or create one Books customer without name-only matching. Unknown POST
 * outcomes remain AMBIGUOUS until an exact CRM-account linkage proves the create.
 */
export async function ensureBooksCustomer(accountId: string): Promise<BooksCustomerResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  })
  if (!account) throw new Error('Account not found')
  if (account.booksCustomerId) return { state: 'SUCCEEDED', booksCustomerId: account.booksCustomerId }
  if (!ORG_ID) throw new Error('ZOHO_ORGANIZATION_ID is not configured')

  const primary = account.contacts[0]
  const payload = {
    contact_name: account.name,
    company_name: account.name,
    customer_sub_type: 'business',
    ...(account.crmAccountId ? { zcrm_account_id: account.crmAccountId } : {}),
    billing_address: { street: account.billingStreet || '', city: account.billingCity || '', state: account.billingState || '', zip: account.billingZip || '', country: 'US' },
    shipping_address: { street: account.shippingStreet || account.billingStreet || '', city: account.shippingCity || account.billingCity || '', state: account.shippingState || account.billingState || '', zip: account.shippingZip || account.billingZip || '', country: 'US' },
    ...(primary ? { contact_persons: [{ first_name: primary.firstName || '', last_name: primary.lastName || '', email: primary.email || '', phone: primary.phone || '', mobile: primary.mobilePhone || '', is_primary_contact: true }] } : {}),
  }
  const operationKey = `books:customer:create:${account.id}`
  const operation = await prisma.providerWriteOperation.upsert({
    where: { operationKey }, update: {},
    create: { operationKey, provider: 'ZOHO_BOOKS', entityType: 'Account', entityId: account.id, operation: 'CREATE_CUSTOMER', requestFingerprint: fingerprint(payload) },
  })
  if (operation.state === 'SUCCEEDED') {
    const ids = operation.providerRecordIds as { booksCustomerId?: string } | null
    return { state: 'SUCCEEDED', booksCustomerId: ids?.booksCustomerId }
  }

  const token = await getZohoAccessToken()
  if (account.crmAccountId) {
    const existing = await findByCrmAccountId(account.crmAccountId, token)
    if (existing) return persistBooksCustomer(account.id, operationKey, existing, 'EXACT_CRM_LINK', 'Resolved by exact CRM account linkage.')
  }
  if (operation.state === 'AMBIGUOUS') return { state: 'AMBIGUOUS', message: 'Prior Books customer submission remains ambiguous; no automatic resend is allowed.' }

  const claimed = await prisma.providerWriteOperation.updateMany({
    where: { operationKey, state: { in: ['PENDING', 'FAILED'] } },
    data: { state: 'SYNCING', attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastError: null },
  })
  if (claimed.count !== 1) return { state: 'SYNCING', message: 'Books customer creation is already in progress.' }

  try {
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/contacts?organization_id=${encodeURIComponent(ORG_ID)}`, {
      method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = await response.json().catch(() => null)
    const id = String(body?.contact?.contact_id || '').trim()
    if (!response.ok || Number(body?.code) !== 0 || !id) {
      const code = String(body?.code ?? `HTTP_${response.status}`)
      const message = String(body?.message || 'Zoho Books rejected customer creation.')
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } })
      return { state: 'FAILED', code, message }
    }
    return persistBooksCustomer(account.id, operationKey, id, String(body.code), String(body.message || 'success'))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Books customer submission error'
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: message, providerMessage: 'Submission outcome is unknown; exact reconciliation is required.' } })
    await prisma.account.update({ where: { id: account.id }, data: { providerSyncState: 'AMBIGUOUS', providerSyncError: message } })
    return { state: 'AMBIGUOUS', message: 'Books customer outcome is unknown and will not be resent automatically.' }
  }
}
