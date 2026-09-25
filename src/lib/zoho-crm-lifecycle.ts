import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

const ZOHO_DC = process.env.ZOHO_DC?.trim().replace(/^(?:["'])(.*)(?:["'])$/, '$1') || 'com'
const CRM_TIMEOUT_MS = 15000

type ProviderResult = {
  state: 'PENDING' | 'SYNCING' | 'SUCCEEDED' | 'FAILED' | 'AMBIGUOUS'
  crmLeadId?: string
  code?: string
  message?: string
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function crmRow(payload: any): any {
  return Array.isArray(payload?.data) ? payload.data[0] : null
}

function successfulRecordId(payload: any): string | null {
  const row = crmRow(payload)
  return String(row?.details?.id || row?.id || '').trim() || null
}

async function lookupAcceptedLead(email: string | null, company: string, token: string): Promise<string | null> {
  if (!email) return null
  const criteria = encodeURIComponent(`(Email:equals:${email})`)
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads/search?criteria=${criteria}&fields=id,Company,Email`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
  })
  if (response.status === 204) return null
  if (!response.ok) return null
  const payload = await response.json()
  const exact = (payload?.data || []).filter((candidate: any) =>
    String(candidate.Email || '').toLowerCase() === email.toLowerCase()
    && String(candidate.Company || '').toLowerCase() === company.toLowerCase())
  return exact.length === 1 ? String(exact[0].id) : null
}

async function completeLeadWrite(leadId: string, operationKey: string, crmLeadId: string, code?: string, message?: string): Promise<ProviderResult> {
  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { crmLeadId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } }),
    prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', providerRecordIds: { crmLeadId }, providerCode: code || null, providerMessage: message || null, lastError: null, completedAt: new Date(), nextAttemptAt: null } }),
  ])
  return { state: 'SUCCEEDED', crmLeadId, code, message }
}

/** Durable create with lookup-before-retry for an ambiguous prior submission. */
export async function persistPortalLeadToCrm(leadId: string): Promise<ProviderResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { owner: { select: { zohoId: true } } } })
  if (!lead) throw new Error('Lead not found')
  if (lead.crmLeadId) return { state: 'SUCCEEDED', crmLeadId: lead.crmLeadId }

  const payload = {
    Company: lead.company,
    Last_Name: lead.lastName || lead.company,
    First_Name: lead.firstName || undefined,
    Email: lead.email || undefined,
    Phone: lead.phone || undefined,
    Mobile: lead.mobile || undefined,
    Designation: lead.title || undefined,
    Industry: lead.industry || undefined,
    Lead_Status: lead.status || 'New Lead',
    Street: lead.street || undefined,
    City: lead.city || undefined,
    State: lead.state || undefined,
    Zip_Code: lead.zip || undefined,
    Time_Zone: lead.timeZone || undefined,
    Owner: lead.owner.zohoId ? { id: lead.owner.zohoId } : undefined,
  }
  const operationKey = `crm:lead:create:${lead.id}`
  const operation = await prisma.providerWriteOperation.upsert({
    where: { operationKey },
    update: {},
    create: { operationKey, provider: 'ZOHO_CRM', entityType: 'Lead', entityId: lead.id, operation: 'CREATE', requestFingerprint: fingerprint(payload) },
  })
  if (operation.state === 'SUCCEEDED') {
    const ids = operation.providerRecordIds as { crmLeadId?: string } | null
    return { state: 'SUCCEEDED', crmLeadId: ids?.crmLeadId }
  }

  const token = await getZohoAccessToken()
  if (operation.state === 'AMBIGUOUS') {
    const existingId = await lookupAcceptedLead(lead.email, lead.company, token)
    if (existingId) return completeLeadWrite(lead.id, operationKey, existingId, 'LOOKUP_MATCH', 'Recovered an accepted CRM create by exact email and company.')
    return { state: 'AMBIGUOUS', message: 'Prior submission remains ambiguous and requires review.' }
  }

  const claimed = await prisma.providerWriteOperation.updateMany({
    where: { operationKey, state: { in: ['PENDING', 'FAILED'] } },
    data: { state: 'SYNCING', attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastError: null },
  })
  if (claimed.count !== 1) return { state: 'SYNCING', message: 'Provider write is already in progress.' }
  await prisma.lead.update({ where: { id: lead.id }, data: { providerSyncState: 'SYNCING', providerSyncError: null } })

  try {
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [payload], trigger: [] }),
      signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
    })
    const body = await response.json().catch(() => null)
    const row = crmRow(body)
    const id = successfulRecordId(body)
    if (!response.ok || row?.status !== 'success' || !id) {
      const code = String(row?.code || body?.code || `HTTP_${response.status}`)
      const message = String(row?.message || body?.message || 'Zoho CRM rejected the lead.')
      await prisma.$transaction([
        prisma.lead.update({ where: { id: lead.id }, data: { providerSyncState: 'FAILED', providerSyncError: `${code}: ${message}` } }),
        prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } }),
      ])
      return { state: 'FAILED', code, message }
    }
    return completeLeadWrite(lead.id, operationKey, id, String(row.code || 'SUCCESS'), String(row.message || 'success'))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider submission error'
    await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: { providerSyncState: 'AMBIGUOUS', providerSyncError: message } }),
      prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: message, providerMessage: 'Submission outcome is unknown; lookup is required before retry.' } }),
    ])
    return { state: 'AMBIGUOUS', message: 'CRM submission outcome is unknown; it will not be resent automatically.' }
  }
}

export async function convertPersistedCrmLead(leadId: string, accountId: string): Promise<ProviderResult & { crmAccountId?: string; crmContactId?: string }> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead?.crmLeadId) return { state: 'PENDING', message: 'Lead must be persisted to CRM before conversion.' }
  const operationKey = `crm:lead:convert:${lead.id}`
  const payload = { overwrite: false, notify_lead_owner: false, notify_new_entity_owner: false }
  const operation = await prisma.providerWriteOperation.upsert({
    where: { operationKey },
    update: {},
    create: { operationKey, provider: 'ZOHO_CRM', entityType: 'Lead', entityId: lead.id, operation: 'CONVERT', requestFingerprint: fingerprint(payload) },
  })
  if (operation.state === 'SUCCEEDED') {
    const ids = operation.providerRecordIds as { crmAccountId?: string; crmContactId?: string } | null
    return { state: 'SUCCEEDED', crmAccountId: ids?.crmAccountId, crmContactId: ids?.crmContactId }
  }
  if (operation.state === 'AMBIGUOUS') return { state: 'AMBIGUOUS', message: 'Prior conversion outcome is ambiguous and requires provider reconciliation.' }

  const claimed = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: { in: ['PENDING', 'FAILED'] } }, data: { state: 'SYNCING', attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastError: null } })
  if (claimed.count !== 1) return { state: 'SYNCING', message: 'CRM conversion is already in progress.' }
  const token = await getZohoAccessToken()
  try {
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads/${lead.crmLeadId}/actions/convert`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [payload] }),
      signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
    })
    const body = await response.json().catch(() => null)
    const row = crmRow(body)
    const details = row?.details || {}
    const crmAccountId = String(details.Accounts || details.accounts || '').trim()
    const crmContactId = String(details.Contacts || details.contacts || '').trim()
    if (!response.ok || row?.status !== 'success' || !crmAccountId) {
      const code = String(row?.code || body?.code || `HTTP_${response.status}`)
      const message = String(row?.message || body?.message || 'Zoho CRM rejected the conversion.')
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } })
      await prisma.account.update({ where: { id: accountId }, data: { providerSyncState: 'FAILED', providerSyncError: `${code}: ${message}` } })
      return { state: 'FAILED', code, message }
    }
    const primaryContact = await prisma.contact.findFirst({ where: { accountId, isPrimary: true }, select: { id: true } })
    await prisma.$transaction([
      prisma.account.update({ where: { id: accountId }, data: { crmAccountId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } }),
      ...(primaryContact && crmContactId ? [prisma.contact.update({ where: { id: primaryContact.id }, data: { crmContactId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } })] : []),
      prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', providerRecordIds: { crmLeadId: lead.crmLeadId, crmAccountId, crmContactId: crmContactId || null }, providerCode: String(row.code || 'SUCCESS'), providerMessage: String(row.message || 'success'), completedAt: new Date(), lastError: null } }),
    ])
    return { state: 'SUCCEEDED', crmAccountId, crmContactId: crmContactId || undefined }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider conversion error'
    await prisma.$transaction([
      prisma.account.update({ where: { id: accountId }, data: { providerSyncState: 'AMBIGUOUS', providerSyncError: message } }),
      prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: message, providerMessage: 'Conversion outcome is unknown and will not be retried automatically.' } }),
    ])
    return { state: 'AMBIGUOUS', message: 'CRM conversion outcome is unknown and requires reconciliation.' }
  }
}
