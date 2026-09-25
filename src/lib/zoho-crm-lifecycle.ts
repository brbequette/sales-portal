import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'
import { interpretCrmConversionResponse, interpretCrmWriteResponse } from '@/lib/zoho-crm-response'

const ZOHO_DC = process.env.ZOHO_DC?.trim().replace(/^(?:["'])(.*)(?:["'])$/, '$1') || 'com'
const CRM_TIMEOUT_MS = 15000

type ProviderResult = {
  state: 'PENDING' | 'SYNCING' | 'SUCCEEDED' | 'FAILED' | 'AMBIGUOUS'
  crmLeadId?: string
  code?: string
  message?: string
}

export function normalizeCrmLeadStatus(status: string | null | undefined) {
  return status === 'Converted' ? 'New Lead' : (status || 'New Lead')
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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
  // Provider JSON is runtime-validated below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    Lead_Status: normalizeCrmLeadStatus(lead.status),
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
    const result = interpretCrmWriteResponse(response.status, body)
    if (!result.ok) {
      const { code, message } = result
      await prisma.$transaction([
        prisma.lead.update({ where: { id: lead.id }, data: { providerSyncState: 'FAILED', providerSyncError: `${code}: ${message}` } }),
        prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } }),
      ])
      return { state: 'FAILED', code, message }
    }
    return completeLeadWrite(lead.id, operationKey, result.id, result.code, result.message)
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
    if (!ids?.crmAccountId) return { state: 'FAILED', message: 'Completed conversion operation is missing its CRM Account ID.' }
    return completeConversionPersistence(lead.id, accountId, operationKey, ids.crmAccountId, ids.crmContactId || '', operation.providerCode || undefined, operation.providerMessage || undefined)
  }
  if (operation.state === 'AMBIGUOUS') {
    const token = await getZohoAccessToken()
    const recovered = await lookupConvertedEntities(lead.email, lead.company, token)
    if (recovered) return completeConversionPersistence(lead.id, accountId, operationKey, recovered.crmAccountId, recovered.crmContactId, 'LOOKUP_MATCH', 'Recovered conversion by exact Contact email and linked Account name.')
    return { state: 'AMBIGUOUS', message: 'Prior conversion outcome is ambiguous and exact provider reconciliation found no unique match.' }
  }

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
    const result = interpretCrmConversionResponse(response.status, body)
    if (!result.ok) {
      const { code, message } = result
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'FAILED', providerCode: code, providerMessage: message, lastError: message, completedAt: new Date() } })
      await prisma.account.update({ where: { id: accountId }, data: { providerSyncState: 'FAILED', providerSyncError: `${code}: ${message}` } })
      return { state: 'FAILED', code, message }
    }
    return completeConversionPersistence(lead.id, accountId, operationKey, result.accountId!, result.contactId || '', result.code, result.message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider conversion error'
    await prisma.$transaction([
      prisma.account.update({ where: { id: accountId }, data: { providerSyncState: 'AMBIGUOUS', providerSyncError: message } }),
      prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: message, providerMessage: 'Conversion outcome is unknown and will not be retried automatically.' } }),
    ])
    return { state: 'AMBIGUOUS', message: 'CRM conversion outcome is unknown and requires reconciliation.' }
  }
}

async function lookupConvertedEntities(email: string | null, company: string, token: string) {
  if (!email) return null
  const criteria = encodeURIComponent(`(Email:equals:${email})`)
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=${criteria}&fields=id,Email,Account_Name`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
  })
  if (response.status === 204 || !response.ok) return null
  const body = await response.json().catch(() => null)
  // Provider JSON is runtime-validated below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches = (body?.data || []).filter((contact: any) =>
    String(contact?.Email || '').trim().toLowerCase() === email.trim().toLowerCase()
    && String(contact?.Account_Name?.name || '').trim().toLowerCase() === company.trim().toLowerCase()
    && String(contact?.Account_Name?.id || '').trim()
    && String(contact?.id || '').trim())
  if (matches.length !== 1) return null
  return { crmAccountId: String(matches[0].Account_Name.id), crmContactId: String(matches[0].id) }
}

async function completeConversionPersistence(leadId: string, accountId: string, operationKey: string, crmAccountId: string, crmContactId: string, code?: string, message?: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { crmLeadId: true } })
  const primaryContact = await prisma.contact.findFirst({ where: { accountId, isPrimary: true }, select: { id: true } })
  await prisma.$transaction([
    prisma.account.update({ where: { id: accountId }, data: { crmAccountId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } }),
    ...(primaryContact && crmContactId ? [prisma.contact.update({ where: { id: primaryContact.id }, data: { crmContactId, providerSyncState: 'SUCCEEDED', providerSyncError: null, providerSyncedAt: new Date() } })] : []),
    prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', providerRecordIds: { crmLeadId: lead?.crmLeadId || null, crmAccountId, crmContactId: crmContactId || null }, providerCode: code || null, providerMessage: message || null, completedAt: new Date(), lastError: null } }),
  ])
  return { state: 'SUCCEEDED' as const, crmAccountId, crmContactId: crmContactId || undefined, code, message }
}
