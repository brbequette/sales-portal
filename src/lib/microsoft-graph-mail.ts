import { prisma } from "@/lib/prisma"
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
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Microsoft token request failed (${response.status}).`)
  const payload = await response.json() as { access_token?: string }
  if (!payload.access_token) throw new Error("Microsoft token response did not include an access token.")
  return payload.access_token
}

async function graphJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}) for ${path.split("?")[0]}.`)
  return response.json() as Promise<T>
}

const addresses = (recipients: GraphRecipient[] | undefined) => (recipients || [])
  .map(item => item.emailAddress?.address?.trim())
  .filter(Boolean)
  .join(", ")

async function syncAttachments(token: string, mailbox: string, messageId: string, emailId: string) {
  const payload = await graphJson<{ value?: Array<{ id: string; name?: string; contentType?: string; size?: number; contentId?: string; isInline?: boolean }> }>(
    token,
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline,contentId`,
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
  const fromAddress = message.from?.emailAddress?.address || "unknown"
  const bodyHtml = message.body?.content || ""
  const body = message.body?.contentType?.toLowerCase() === "html" ? plainTextFromHtml(bodyHtml) : bodyHtml
  const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime) : undefined
  const sentAt = message.sentDateTime ? new Date(message.sentDateTime) : undefined
  const direction = folder === "sentitems" ? "OUTBOUND" : "INBOUND"
  const email = await prisma.email.upsert({
    where: { provider_mailboxAddress_externalMessageId: { provider: "MICROSOFT_365", mailboxAddress: mailbox, externalMessageId: message.id } },
    create: {
      provider: "MICROSOFT_365", externalMessageId: message.id, internetMessageId: message.internetMessageId,
      conversationId: message.conversationId, mailboxAddress: mailbox, emailMailboxId: mailboxRecord?.id, userId: mailboxRecord?.userId,
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
  for (const [index, draft] of drafts.entries()) {
    const match = await matchOperationalEvent(draft.data)
    const fingerprint = eventFingerprint(message.id, draft, index)
    await prisma.emailOperationalEvent.upsert({
      where: { sourceFingerprint: fingerprint },
      create: {
        emailId: email.id, eventType: draft.eventType, confidence: draft.confidence, effectiveAt: draft.effectiveAt,
        summary: draft.summary, extractedData: draft.data as Prisma.InputJsonValue, sourceFingerprint: fingerprint, ...match,
      },
      update: { confidence: draft.confidence, effectiveAt: draft.effectiveAt, summary: draft.summary, extractedData: draft.data as Prisma.InputJsonValue, ...match },
    })
  }
  await prisma.email.update({ where: { id: email.id }, data: { processedAt: new Date(), processingError: null } })
  return { createdEvents: drafts.length }
}

export async function syncMicrosoftMailbox(options?: { mailboxAddress?: string; mailboxId?: string; lookbackDays?: number; maxPerFolder?: number; includeInbox?: boolean; includeSent?: boolean }) {
  const token = await accessToken()
  const mailboxRecord = options?.mailboxId ? await prisma.emailMailbox.findUnique({ where: { id: options.mailboxId }, select: { id: true, userId: true, address: true, lookbackDays: true, includeInbox: true, includeSent: true } }) : null
  const mailbox = options?.mailboxAddress || mailboxRecord?.address || requiredEnv("MICROSOFT_MAILBOX_ADDRESS")
  const lookbackDays = Math.max(1, Math.min(options?.lookbackDays || mailboxRecord?.lookbackDays || 90, 365))
  const maxPerFolder = Math.max(1, Math.min(options?.maxPerFolder || 50, 250))
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString()
  let processed = 0
  let createdEvents = 0
  const errors: string[] = []

  const folders = ([
    (options?.includeInbox ?? mailboxRecord?.includeInbox ?? true) ? "inbox" : null,
    (options?.includeSent ?? mailboxRecord?.includeSent ?? true) ? "sentitems" : null,
  ].filter(Boolean)) as Array<"inbox" | "sentitems">
  for (const folder of folders) {
    const params = new URLSearchParams({
      "$top": String(maxPerFolder),
      "$orderby": folder === "sentitems" ? "sentDateTime desc" : "receivedDateTime desc",
      "$filter": `${folder === "sentitems" ? "sentDateTime" : "receivedDateTime"} ge ${since}`,
      "$select": "id,internetMessageId,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments",
    })
    const payload = await graphJson<{ value?: GraphMessage[] }>(token, `/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages?${params}`)
    for (const message of payload.value || []) {
      try {
        const result = await processMessage(token, mailbox, folder, message, mailboxRecord || undefined)
        processed += 1
        createdEvents += result.createdEvents
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  if (mailboxRecord) {
    await prisma.emailMailbox.update({ where: { id: mailboxRecord.id }, data: { lastSyncAt: new Date(), lastSyncStatus: errors.length ? "COMPLETED_WITH_ERRORS" : "SUCCESS", lastSyncError: errors[0] || null } })
  }
  return { processed, createdEvents, errors: errors.slice(0, 20), mailbox, lookbackDays }
}

export async function syncEnabledMicrosoftMailboxes(options?: { maxPerFolder?: number }) {
  const mailboxes = await prisma.emailMailbox.findMany({ where: { enabled: true, autoSync: true }, orderBy: { address: "asc" } })
  if (!mailboxes.length) return [await syncMicrosoftMailbox({ maxPerFolder: options?.maxPerFolder })]
  const results = []
  for (const mailbox of mailboxes) {
    try {
      results.push(await syncMicrosoftMailbox({ mailboxId: mailbox.id, maxPerFolder: options?.maxPerFolder }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await prisma.emailMailbox.update({ where: { id: mailbox.id }, data: { lastSyncAt: new Date(), lastSyncStatus: "FAILED", lastSyncError: message } })
      results.push({ mailbox: mailbox.address, processed: 0, createdEvents: 0, errors: [message], lookbackDays: mailbox.lookbackDays })
    }
  }
  return results
}
