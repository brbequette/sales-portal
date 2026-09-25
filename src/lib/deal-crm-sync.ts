import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getZohoAccessToken, ZOHO_DC } from './zoho-auth'
import { getDealPackage, object } from './deal-package'
import { isCrmId } from './deal-lifecycle'

export type DealSyncConfig = { enabled: boolean; identityField: string; stages: Record<string, string>; portalUrl: string; pipeline?: string }
export const CONFIG_KEY = 'invoice_deal_sync_config'
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function getDealSyncConfig(): Promise<DealSyncConfig | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } })
  return row ? JSON.parse(row.value) : null
}
export async function crmRequest(path: string, options: RequestInit = {}) {
  const token = await getZohoAccessToken()
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v8/${path}`, {
    ...options, headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, signal: AbortSignal.timeout(20000),
  })
  if (response.status === 204) return { data: [] }
  const body = await response.json()
  if (!response.ok || body.status === 'error') throw new Error(`CRM_${response.status}_${body.code || 'REQUEST_FAILED'}`)
  return body
}
export async function crmMetadata() { return (await crmRequest('settings/fields?module=Deals')).fields as any[] }
export function validateDealSyncConfig(config: DealSyncConfig, fields: any[]) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(config.identityField)) throw new Error('INVALID_IDENTITY_FIELD')
  const identity = fields.find(f => f.api_name === config.identityField)
  if (!identity || !identity.unique || identity.data_type !== 'text' || identity.field_read_only === true) throw new Error('CRM_UNIQUE_IDENTITY_FIELD_REQUIRED')
  if (fields.some(f => f.api_name === 'Pipeline' && f.system_mandatory) && !config.pipeline) throw new Error('CRM_PIPELINE_REQUIRED')
  const stages = new Set((fields.find(f => f.api_name === 'Stage')?.pick_list_values || []).map((v: any) => v.actual_value))
  for (const disposition of ['Needs Review','Written Off','Voided','Draft Invoice','Credited / Refunded','Settled — Review Payment','Overdue','Partially Paid','Invoiced','Paid','Complete']) {
    if (!config.stages?.[disposition] || !stages.has(config.stages[disposition])) throw new Error(`CRM_STAGE_MAPPING_REQUIRED:${disposition}`)
  }
  const url = new URL(config.portalUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('HTTPS_PORTAL_URL_REQUIRED')
}
export function mergePackageDescription(description: string | null | undefined, summary: string) {
  const start = '[Titan deal package]', end = '[/Titan deal package]'
  const original = description || ''
  const startIndex = original.indexOf(start), endIndex = original.indexOf(end)
  if ((startIndex >= 0) !== (endIndex >= 0) || (startIndex >= 0 && endIndex < startIndex)) throw new Error('MALFORMED_MANAGED_DESCRIPTION')
  const block = `${start}\n${summary}\n${end}`
  const next = startIndex < 0 ? `${original}${original ? '\n\n' : ''}${block}` : `${original.slice(0, startIndex)}${block}${original.slice(endIndex + end.length)}`
  if (next.length > 32000) throw new Error('CRM_DESCRIPTION_CAPACITY_EXCEEDED')
  return next
}

/** A timeout/unknown result is never automatically re-issued. Reconciliation is read-only. */
export async function guardedWrite(key: string, dealId: string, payload: unknown, write: () => Promise<string>, verify: () => Promise<string | null>) {
  const operation = await prisma.providerWriteOperation.upsert({ where: { operationKey: key }, update: {}, create: {
    operationKey: key, provider: 'ZOHO_CRM', entityType: 'Deal', entityId: dealId, operation: 'SYNC_DEAL_PACKAGE', requestFingerprint: digest(payload),
  } })
  if (operation.requestFingerprint !== digest(payload)) throw new Error('CRM_OPERATION_PAYLOAD_CHANGED')
  if (operation.state !== 'PENDING') {
    const verifiedId = await verify()
    if (!verifiedId) throw new Error(`CRM_OPERATION_${operation.state}_REQUIRES_RECONCILIATION`)
    await prisma.providerWriteOperation.update({ where: { id: operation.id }, data: { state: 'SUCCEEDED', completedAt: new Date(), providerRecordIds: { id: verifiedId } } })
    return verifiedId
  }
  const claimed = await prisma.providerWriteOperation.updateMany({ where: { id: operation.id, state: 'PENDING' }, data: { state: 'SYNCING', attemptCount: { increment: 1 }, lastAttemptAt: new Date() } })
  if (claimed.count !== 1) throw new Error('CRM_OPERATION_ALREADY_CLAIMED')
  try {
    const id = await write()
    const verified = await verify()
    if (verified !== id) throw new Error('CRM_READBACK_MISMATCH')
    await prisma.providerWriteOperation.update({ where: { id: operation.id }, data: { state: 'SUCCEEDED', completedAt: new Date(), providerRecordIds: { id } } })
    return id
  } catch (error) {
    await prisma.providerWriteOperation.update({ where: { id: operation.id }, data: { state: 'AMBIGUOUS', lastError: error instanceof Error ? error.message : 'CRM_UNKNOWN_OUTCOME' } })
    throw error
  }
}
const successId = (result: any) => {
  const row = result.data?.[0]
  if (row?.status !== 'success' || !isCrmId(row.details?.id)) throw new Error(`CRM_RECORD_${row?.code || 'INVALID_RESPONSE'}`)
  return row.details.id as string
}

export async function syncDealToCrm(dealId: string, config: DealSyncConfig) {
  const pkg = await getDealPackage(dealId)
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })
  const previous = object(deal.rawData)._portalSync || {}
  const crmAccountId = pkg.account.crmAccountId
  if (!isCrmId(crmAccountId)) throw new Error('AUTHORITATIVE_CRM_ACCOUNT_REQUIRED')
  if (!isCrmId(pkg.deal.owner.zohoId)) throw new Error('AUTHORITATIVE_CRM_OWNER_REQUIRED')
  if (previous.ownerEvidence === 'PROVISIONAL_ACCOUNT_OWNER') throw new Error('INVOICE_OWNER_REVIEW_REQUIRED')
  const targetStage = config.stages[pkg.lifecycle.disposition]
  if (!targetStage) throw new Error('CRM_STAGE_MAPPING_REQUIRED')
  const identity = config.identityField
  const search = async () => {
    const rows = (await crmRequest(`Deals/search?criteria=${encodeURIComponent(`(${identity}:equals:${dealId})`)}`)).data || []
    if (rows.length > 1) throw new Error('DUPLICATE_CRM_DEAL_IDENTITY')
    return rows[0] || null
  }
  let remote = isCrmId(deal.zohoId) ? (await crmRequest(`Deals/${deal.zohoId}`)).data?.[0] : await search()
  if (remote && remote.Account_Name?.id !== crmAccountId) throw new Error('CRM_ACCOUNT_MISMATCH')
  if (remote?.[identity] && remote[identity] !== dealId) throw new Error('CRM_IDENTITY_CONFLICT')
  if (!remote) {
    // Stable create payload; mutable totals/stage follow in the guarded update after identity exists.
    const createPayload = { [identity]: dealId, Deal_Name: deal.name, Account_Name: { id: crmAccountId }, Owner: { id: pkg.deal.owner.zohoId }, Stage: targetStage, Closing_Date: (deal.closingDate || deal.createdAt).toISOString().slice(0, 10), ...(config.pipeline ? { Pipeline: config.pipeline } : {}) }
    const crmId = await guardedWrite(`deal-create:${dealId}`, dealId, createPayload,
      async () => successId(await crmRequest('Deals', { method: 'POST', body: JSON.stringify({ data: [createPayload], trigger: [], skip_feature_execution: [{ name: 'cadences' }] }) })),
      async () => (await search())?.id || null)
    remote = (await crmRequest(`Deals/${crmId}`)).data?.[0]
  }
  if (!remote || !isCrmId(remote.id)) throw new Error('CRM_DEAL_NOT_FOUND')
  if (remote.Account_Name?.id !== crmAccountId) throw new Error('CRM_ACCOUNT_MISMATCH')
  if (remote.Owner?.id !== pkg.deal.owner.zohoId) throw new Error('CRM_OWNER_MISMATCH')
  const crmNotes: any[] = []
  for (let page = 1; page <= 50; page++) {
    const response = await crmRequest(`Deals/${remote.id}/Notes?per_page=200&page=${page}`)
    crmNotes.push(...(response.data || []))
    if (!response.info?.more_records) break
    if (page === 50) throw new Error('CRM_NOTES_PAGINATION_LIMIT')
  }
  // CRM custom fields/notes stay CRM-owned. Only the marked block and invoice-owned fields are written.
  const summary = `Disposition: ${pkg.lifecycle.disposition}\nInvoice total: ${pkg.financials.invoiceAmount}\nBalance: ${pkg.financials.balance ?? 'Unknown'}\nProfit: ${pkg.financials.profit ?? 'Unknown'}\nFulfillment: ${pkg.lifecycle.fulfillment}\nInvoices: ${pkg.invoices.map(i => i.invoiceNumber || i.zohoId).join(', ')}\n${pkg.unknowns.join('\n')}\nLive complete package: ${config.portalUrl.replace(/\/$/, '')}/deals/${dealId}\nVersioned JSON package is attached to this CRM deal.`
  const payload = { id: remote.id, [identity]: dealId, Amount: Math.round(pkg.financials.invoiceAmount * 100) / 100, Stage: targetStage, Description: mergePackageDescription(remote.Description, summary) }
  const fieldMatches = (record: any) => record && record.Account_Name?.id === crmAccountId && Object.entries(payload).every(([key, value]) => record[key] === value)
  if (!fieldMatches(remote)) {
    if (!remote.Modified_Time) throw new Error('CRM_MODIFIED_TIME_REQUIRED')
    await guardedWrite(`deal-update:${dealId}:${digest(payload)}:${remote.Modified_Time}`, dealId, payload,
      async () => successId(await crmRequest(`Deals/${remote.id}`, { method: 'PUT', headers: { 'If-Unmodified-Since': remote.Modified_Time }, body: JSON.stringify({ data: [payload], trigger: [], skip_feature_execution: [{ name: 'cadences' }] }) })),
      async () => { const record = (await crmRequest(`Deals/${remote.id}`)).data?.[0]; return fieldMatches(record) ? record.id : null })
  }
  const { sync: _sync, ...packageContent } = pkg
  // Exclude volatile CRM metadata and sync receipts from the content hash to avoid feedback loops.
  const exportPackage = { ...packageContent, crmNotes, deal: { ...packageContent.deal, crmId: remote.id, crmFields: undefined } }
  const hash = digest(exportPackage)
  const filename = `Titan-deal-package-${hash}.json`
  {
    const findAttachment = async () => {
      for (let page = 1; page <= 50; page++) {
        const response = await crmRequest(`Deals/${remote.id}/Attachments?fields=id,File_Name&per_page=200&page=${page}`)
        const rows = response.data || []
        const matches = rows.filter((row: any) => row.File_Name === filename)
        if (matches.length > 1) throw new Error('DUPLICATE_PACKAGE_ATTACHMENT')
        if (matches[0]) {
          const token = await getZohoAccessToken()
          const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v8/Deals/${remote.id}/Attachments/${matches[0].id}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(20000) })
          if (!response.ok || digest(await response.json()) !== hash) throw new Error('PACKAGE_ATTACHMENT_CONTENT_MISMATCH')
          return matches[0].id as string
        }
        if (!response.info?.more_records) return null
      }
      throw new Error('ATTACHMENT_PAGINATION_LIMIT')
    }
    if (!await findAttachment()) await guardedWrite(`deal-attachment:${dealId}:${hash}`, dealId, { hash }, async () => {
      const form = new FormData(); form.append('file', new Blob([JSON.stringify(exportPackage, null, 2)], { type: 'application/json' }), filename)
      return successId(await crmRequest(`Deals/${remote.id}/Attachments`, { method: 'POST', body: form }))
    }, findAttachment)
  }
  const updatedRemote = (await crmRequest(`Deals/${remote.id}`)).data?.[0]
  if (!fieldMatches(updatedRemote)) throw new Error('CRM_FINAL_READBACK_MISMATCH')
  const persisted = await prisma.deal.updateMany({ where: { id: deal.id, updatedAt: deal.updatedAt }, data: {
    zohoId: remote.id,
    name: updatedRemote.Deal_Name || deal.name,
    rawData: { ...object(deal.rawData), ...updatedRemote, _portalCrmNotes: crmNotes, _portalSync: { ...previous, state: 'SYNCED', crmId: remote.id, packageHash: hash, syncedAt: new Date().toISOString() } } as Prisma.InputJsonValue,
  } })
  if (persisted.count !== 1) throw new Error('LOCAL_DEAL_CHANGED_DURING_SYNC')
  return { dealId, crmId: remote.id, packageHash: hash }
}
