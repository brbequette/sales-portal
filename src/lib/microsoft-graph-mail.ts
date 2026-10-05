import { prisma } from "@/lib/prisma"
import { randomUUID } from "node:crypto"
import { isMailboxAddress, normalizeMailboxAddress, graphContinuationUrl } from "./email-intelligence-guards"
import type { Prisma } from "@prisma/client"
import {
  attachmentClassification,
  eventFingerprint,
  extractOperationalEvents,
  matchOperationalEvent,
  plainTextFromHtml,
} from "@/lib/email-operational-intelligence"

type GraphRecipient = { emailAddress?: { address?: string; name?: string } }
type GraphMessage = {
  id: string
  "@removed"?: { reason?: string }
  internetMessageId?: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  body?: { content?: string; contentType?: string }
  from?: GraphRecipient
  toRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  receivedDateTime?: string
  sentDateTime?: string
  isRead?: boolean
  hasAttachments?: boolean
}

const requiredEnv = (name: string) => {
  const value = String(process.env[name] || "").trim()
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function getMicrosoftMailConfiguration() {
  const fields = ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]
  return {
    provider: "MICROSOFT_365",
    configured: fields.every(name => Boolean(String(process.env[name] || "").trim())),
    mailboxAddress: String(process.env.MICROSOFT_MAILBOX_ADDRESS || "").trim() || null,
    missing: fields.filter(name => !String(process.env[name] || "").trim()),
  }
}

async function accessToken() {
  const tenant = requiredEnv("MICROSOFT_TENANT_ID")
  const form = new URLSearchParams({
    client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
    client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  })
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Microsoft token request failed (${response.status}).`)
  const payload = await response.json() as { access_token?: string }
  if (!payload.access_token) throw new Error("Microsoft token response did not include an access token.")
  return payload.access_token
}

class GraphMailError extends Error {
  constructor(public status: number, public retryAt?: number) { super(`Microsoft Graph request failed (${status}).${status === 429 ? ' Sync will resume after Microsoft allows another request.' : ''}`) }
}

async function graphJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(graphContinuationUrl(path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`), {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html", IdType="ImmutableId", odata.maxpagesize=5' },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    const retry = response.headers.get('Retry-After')
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : undefined
    const date = retry ? Date.parse(retry) : NaN
    throw new GraphMailError(response.status, response.status === 429 ? (seconds !== undefined ? Date.now() + seconds * 1000 : Number.isFinite(date) ? date : Date.now() + 180000) : undefined)
  }
  return response.json() as Promise<T>
}

const addresses = (recipients: GraphRecipient[] | undefined) => (recipients || [])
  .map(item => item.emailAddress?.address?.trim())
  .filter(Boolean)
  .join(", ")

async function syncAttachments(token: string, mailbox: string, messageId: string, emailId: string) {
  const payload = await graphJson<{ value?: Array<{ id: string; name?: string; contentType?: string; size?: number; contentId?: string; isInline?: boolean }> }>(
    token,
    // The collection is the base attachment type; contentId exists only on fileAttachment.
    // Selecting it here makes Graph reject messages with attachments (HTTP 400).
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
  )
  for (const attachment of payload.value || []) {
    const name = attachment.name || "Unnamed attachment"
    await prisma.emailAttachment.upsert({
      where: { emailId_providerAttachmentId: { emailId, providerAttachmentId: attachment.id } },
      create: { emailId, providerAttachmentId: attachment.id, name, contentType: attachment.contentType, size: attachment.size, contentId: attachment.contentId, isInline: attachment.isInline || false, classification: attachmentClassification(name) },
      update: { name, contentType: attachment.contentType, size: attachment.size, contentId: attachment.contentId, isInline: attachment.isInline || false, classification: attachmentClassification(name) },
    })
  }
}

async function processMessage(token: string, mailbox: string, folder: "inbox" | "sentitems", message: GraphMessage, mailboxRecord?: { id: string; userId: string | null }) {
  if (message['@removed']) return { createdEvents: 0 }
  if (message.body === undefined || message.subject === undefined) message = await graphJson<GraphMessage>(token, `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(message.id)}`)
  const fromAddress = message.from?.emailAddress?.address || "unknown"
  const bodyHtml = message.body?.content || ""
  const body = message.body?.contentType?.toLowerCase() === "html" ? plainTextFromHtml(bodyHtml) : bodyHtml
  const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime) : undefined
  const sentAt = message.sentDateTime ? new Date(message.sentDateTime) : undefined
  const counterpart = folder === 'sentitems' ? (message.toRecipients || []).map(r => normalizeMailboxAddress(r.emailAddress?.address)).filter(Boolean) : [normalizeMailboxAddress(fromAddress)]
  const contacts = counterpart.length ? await prisma.contact.findMany({ where: { OR: counterpart.map(email => ({ email: { equals: email, mode: 'insensitive' as const } })) }, select: { id: true, accountId: true }, take: 3 }) : []
  const exactContact = contacts.length === 1 ? contacts[0] : null
  const direction = folder === "sentitems" ? "OUTBOUND" : "INBOUND"
  const email = await prisma.email.upsert({
    where: { provider_mailboxAddress_externalMessageId: { provider: "MICROSOFT_365", mailboxAddress: mailbox, externalMessageId: message.id } },
    create: {
      provider: "MICROSOFT_365", externalMessageId: message.id, internetMessageId: message.internetMessageId,
      conversationId: message.conversationId, mailboxAddress: mailbox, emailMailboxId: mailboxRecord?.id, userId: mailboxRecord?.userId,
      accountId: exactContact?.accountId, contactId: exactContact?.id,
      subject: message.subject || "(No subject)", body,
      bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? bodyHtml : undefined, preview: message.bodyPreview,
      fromAddress, toAddress: addresses(message.toRecipients), ccAddresses: addresses(message.ccRecipients), direction,
      status: message.isRead ? "READ" : direction === "OUTBOUND" ? "SENT" : "RECEIVED", receivedAt, sentAt,
      rawMetadata: { hasAttachments: message.hasAttachments, sourceFolder: folder },
    },
    update: {
      internetMessageId: message.internetMessageId, conversationId: message.conversationId, subject: message.subject || "(No subject)",
      emailMailboxId: mailboxRecord?.id, userId: mailboxRecord?.userId,
      body, bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? bodyHtml : undefined, preview: message.bodyPreview,
      fromAddress, toAddress: addresses(message.toRecipients), ccAddresses: addresses(message.ccRecipients), receivedAt, sentAt,
      rawMetadata: { hasAttachments: message.hasAttachments, sourceFolder: folder },
    },
  })

  if (message.hasAttachments) await syncAttachments(token, mailbox, message.id, email.id)
  const drafts = extractOperationalEvents(email.subject, body, fromAddress)
  if (direction === 'INBOUND' && exactContact && /\?|\b(?:quote|pricing|availability|please (?:call|send|confirm)|follow[ -]?up)\b/i.test(`${email.subject} ${body}`)) {
    drafts.push({ eventType: 'CUSTOMER_FOLLOW_UP', confidence: 0.6, summary: `Review customer request: ${email.subject}`, data: { sourceSender: fromAddress, accountId: exactContact.accountId, contactId: exactContact.id, suggestionOnly: true } })
  }
  let createdEvents = 0
  const documentAccounts = new Set<string>()
  let documentConflict = false
  for (const [index, draft] of drafts.entries()) {
    const match = await matchOperationalEvent(draft.data)
    if (draft.eventType === 'CUSTOMER_FOLLOW_UP' && exactContact) { match.accountId = exactContact.accountId; match.matchMethod = 'EXACT_CONTACT_EMAIL'; match.matchConfidence = 0.95; match.conflictReason = null }
    if (match.accountId) documentAccounts.add(match.accountId)
    if (match.conflictReason && match.conflictReason !== 'No matching local document was found.') documentConflict = true
    const fingerprint = eventFingerprint(`${mailbox}:${message.id}`, draft, index)
    // Never rewrite evidence underneath a reviewer or overwrite a completed decision.
    const inserted = await prisma.emailOperationalEvent.createMany({
      data: [{ emailId: email.id, eventType: draft.eventType, confidence: draft.confidence, effectiveAt: draft.effectiveAt,
        summary: draft.summary, extractedData: JSON.parse(JSON.stringify(draft.data)) as Prisma.InputJsonValue, sourceFingerprint: fingerprint, ...match }],
      skipDuplicates: true,
    })
    createdEvents += inserted.count
  }
  if (!exactContact && documentAccounts.size === 1 && !documentConflict) await prisma.email.updateMany({ where: { id: email.id, accountId: null }, data: { accountId: [...documentAccounts][0] } })
  await prisma.email.update({ where: { id: email.id }, data: { processedAt: new Date(), processingError: null } })
  return { createdEvents }
}

type Folder = 'inbox' | 'sentitems'
type SyncState = { completedMessageIds?: string[]; retryAt?: number; lease?: string; until?: number; history?: string; nextFolder?: Folder; cursors?: Partial<Record<Folder, string>>; backlog?: Partial<Record<Folder, boolean>> }

export async function syncMicrosoftMailbox(options?: { mailboxAddress?: string; mailboxId?: string; lookbackDays?: number; maxPerFolder?: number; includeInbox?: boolean; includeSent?: boolean }) {
  const record = options?.mailboxId
    ? await prisma.emailMailbox.findUnique({ where: { id: options.mailboxId } })
    : await prisma.emailMailbox.findUnique({ where: { address: normalizeMailboxAddress(options?.mailboxAddress || process.env.MICROSOFT_MAILBOX_ADDRESS) } })
  if (!record || !record.enabled || record.provider !== 'MICROSOFT_365') throw new Error('An enabled, assigned Microsoft mailbox is required.')
  const mailbox = normalizeMailboxAddress(record.address)
  if (!isMailboxAddress(mailbox)) throw new Error('Correct the invalid mailbox address before syncing.')
  const folders: Folder[] = []
  if (record.includeInbox) folders.push('inbox')
  if (record.includeSent) folders.push('sentitems')
  if (!folders.length) throw new Error('Enable Inbox or Sent before syncing.')
  const key = `email-intelligence-sync:${record.id}`
  const existing = await prisma.systemSetting.findUnique({ where: { key } })
  const state: SyncState = existing ? JSON.parse(existing.value) : {}
  if ((state.retryAt || 0) > Date.now()) {
    await prisma.emailMailbox.update({ where: { id: record.id }, data: { lastSyncAt: new Date(), lastSyncStatus: 'THROTTLED', lastSyncError: 'Microsoft requested a pause. Sync will resume automatically.' } })
    return { processed: 0, createdEvents: 0, errors: ['Microsoft requested a pause. Sync will resume automatically.'], mailbox, lookbackDays: record.lookbackDays, pending: true }
  }
  delete state.retryAt
  if ((state.until || 0) > Date.now()) throw new Error('This mailbox is already syncing. Try again shortly.')
  const history = `${mailbox}:${record.lookbackDays}:${folders.join(',')}`
  if (state.history !== history) { state.cursors = {}; state.backlog = {}; state.completedMessageIds = []; state.nextFolder = folders[0]; state.history = history }
  state.lease = randomUUID(); state.until = Date.now() + 120000
  let saved = JSON.stringify(state)
  if (existing) {
    const claimed = await prisma.systemSetting.updateMany({ where: { key, value: existing.value }, data: { value: saved } })
    if (!claimed.count) throw new Error('This mailbox is already syncing.')
  } else {
    try { await prisma.systemSetting.create({ data: { key, value: saved } }) }
    catch { throw new Error('This mailbox is already syncing.') }
  }
  const checkpoint = async () => {
    const value = JSON.stringify(state)
    const updated = await prisma.systemSetting.updateMany({ where: { key, value: saved }, data: { value } })
    if (!updated.count) throw new Error('Mailbox sync ownership changed. Retry later.')
    saved = value
  }
  let processed = 0, createdEvents = 0
  let pending = false
  const errors: string[] = []
  const deadline = Date.now() + 18000
  try {
    const token = await accessToken()
    const folder = folders.includes(state.nextFolder!) ? state.nextFolder! : folders[0]
    const params = new URLSearchParams({
      '$top': '5', '$orderby': 'receivedDateTime desc',
      '$filter': `receivedDateTime ge ${new Date(Date.now() - record.lookbackDays * 86400000).toISOString()}`,
      '$select': 'id,internetMessageId,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments',
    })
    const path = state.cursors?.[folder] || `/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages/delta?${params}`
    const page = await graphJson<{ value?: GraphMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(token, path)
    let complete = true
    for (const message of page.value || []) {
      if (state.completedMessageIds?.includes(message.id)) continue
      if (Date.now() >= deadline) { complete = false; pending = true; break }
      try {
        const result = await processMessage(token, mailbox, folder, message, record)
        processed++; createdEvents += result.createdEvents
        state.completedMessageIds = [...(state.completedMessageIds || []), message.id]
        await checkpoint()
      } catch (error) {
        complete = false
        if (error instanceof GraphMailError && error.retryAt) state.retryAt = error.retryAt
        errors.push(error instanceof Error ? error.message : 'Message processing failed.')
        break
      }
    }
    if (complete) {
      state.completedMessageIds = []
      const continuation = page['@odata.nextLink'] || page['@odata.deltaLink']
      if (!continuation) throw new Error('Microsoft did not return a sync continuation. The page will be retried safely.')
      state.cursors = { ...state.cursors, [folder]: graphContinuationUrl(continuation) }
      state.backlog = { ...state.backlog, [folder]: Boolean(page['@odata.nextLink']) }
      pending = folders.some(f => !state.cursors?.[f] || state.backlog?.[f])
      state.nextFolder = folders[(folders.indexOf(folder) + 1) % folders.length]
      await checkpoint()
    }
    await prisma.emailMailbox.update({ where: { id: record.id }, data: { lastSyncAt: new Date(), lastSyncStatus: errors.length ? 'COMPLETED_WITH_ERRORS' : pending ? 'IN_PROGRESS' : 'SUCCESS', lastSyncError: errors[0] || null } })
    return { processed, createdEvents, errors, mailbox, lookbackDays: record.lookbackDays, pending }
  } catch (error) {
    if (error instanceof GraphMailError) {
      if (error.retryAt) state.retryAt = error.retryAt
      if (error.status === 410) {
        const folder = folders.includes(state.nextFolder!) ? state.nextFolder! : folders[0]
        delete state.cursors?.[folder]
        state.completedMessageIds = []
      }
    }
    const message = error instanceof Error ? error.message : 'Mailbox sync failed.'
    await prisma.emailMailbox.update({ where: { id: record.id }, data: { lastSyncAt: new Date(), lastSyncStatus: 'FAILED', lastSyncError: message } })
    throw error
  } finally {
    delete state.lease; delete state.until
    await checkpoint()
  }
}

export async function syncEnabledMicrosoftMailboxes(options?: { maxPerFolder?: number }) {
  if (!getMicrosoftMailConfiguration().configured) throw new Error('Microsoft mailbox connection is not configured.')
  // One bounded page per invocation; oldest-attempted mailbox goes first for fairness.
  const mailboxes = await prisma.emailMailbox.findMany({ where: { enabled: true, autoSync: true, provider: 'MICROSOFT_365' }, orderBy: [{ lastSyncAt: { sort: 'asc', nulls: 'first' } }, { address: 'asc' }], take: 1 })
  const results = []
  for (const mailbox of mailboxes) {
    try { results.push(await syncMicrosoftMailbox({ mailboxId: mailbox.id, maxPerFolder: options?.maxPerFolder })) }
    catch (error) { await prisma.emailMailbox.update({ where: { id: mailbox.id }, data: { lastSyncAt: new Date(), lastSyncStatus: 'FAILED', lastSyncError: error instanceof Error ? error.message : 'Mailbox sync failed.' } }); results.push({ mailbox: mailbox.address, processed: 0, createdEvents: 0, errors: [error instanceof Error ? error.message : 'Mailbox sync failed.'], lookbackDays: mailbox.lookbackDays, pending: true }) }
  }
  return results
}
