import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { indexCallAndCreateSafeFollowUp, upsertCommunicationEvent } from "@/lib/communication-automation"

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit) || 250, 1), 1000)

  const [calls, messages, emails] = await Promise.all([
    prisma.callLog.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    prisma.smsMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    prisma.email.findMany({ where: { accountId: { not: null } }, orderBy: { createdAt: "desc" }, take: limit }),
  ])

  for (const call of calls) await indexCallAndCreateSafeFollowUp(call)
  for (const message of messages) {
    await upsertCommunicationEvent({
      account: { connect: { id: message.accountId } },
      ...(message.contactId ? { contact: { connect: { id: message.contactId } } } : {}),
      ...(message.authorId ? { actor: { connect: { id: message.authorId } } } : {}),
      channel: message.mediaUrl ? "MMS" : "SMS",
      direction: message.direction,
      eventType: "MESSAGE",
      sourceType: "SMS_MESSAGE",
      sourceId: message.id,
      subject: message.direction === "INBOUND" ? "Customer message" : "Sent message",
      summary: message.body.slice(0, 500),
      occurredAt: message.createdAt,
      metadata: { hasMedia: Boolean(message.mediaUrl), campaignBlastId: message.campaignBlastId },
    })
  }
  for (const email of emails) {
    if (!email.accountId) continue
    await upsertCommunicationEvent({
      account: { connect: { id: email.accountId } },
      ...(email.contactId ? { contact: { connect: { id: email.contactId } } } : {}),
      channel: "EMAIL",
      direction: email.direction,
      eventType: "EMAIL",
      sourceType: "EMAIL",
      sourceId: email.id,
      subject: email.subject,
      summary: (email.body || "").replace(/\s+/g, " ").slice(0, 500),
      occurredAt: email.sentAt || email.receivedAt || email.createdAt,
      metadata: { status: email.status, needsResponse: email.needsResponse },
    })
  }

  return NextResponse.json({ success: true, indexed: { calls: calls.length, messages: messages.length, emails: emails.length } })
}
