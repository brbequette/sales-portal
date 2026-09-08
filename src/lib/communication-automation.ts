import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type CallAutomationInput = {
  id: string
  accountId: string
  contactId: string | null
  authorId: string
  direction: string
  status: string
  fromNumber: string
  toNumber: string
  duration: number
  transcript: string | null
  aiSummary: string | null
  createdAt: Date
}

export async function indexCallAndCreateSafeFollowUp(call: CallAutomationInput) {
  const account = await prisma.account.findUnique({
    where: { id: call.accountId },
    select: { ownerId: true, name: true },
  })
  if (!account) return

  const normalizedStatus = call.status.toLowerCase()
  const isInbound = call.direction.toUpperCase() === "INBOUND"
  const needsCallback = isInbound && ["missed", "no_answer", "no answer", "voicemail"].includes(normalizedStatus)

  await prisma.communicationEvent.upsert({
    where: {
      sourceType_sourceId_eventType: {
        sourceType: "CALL_LOG",
        sourceId: call.id,
        eventType: normalizedStatus === "voicemail" ? "VOICEMAIL" : "CALL",
      },
    },
    update: {
      accountId: call.accountId,
      contactId: call.contactId,
      actorId: call.authorId,
      direction: call.direction.toUpperCase(),
      summary: call.aiSummary || `${call.direction} call: ${call.status}`,
      metadata: {
        status: call.status,
        duration: call.duration,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        hasTranscript: Boolean(call.transcript),
      },
    },
    create: {
      accountId: call.accountId,
      contactId: call.contactId,
      actorId: call.authorId,
      channel: "VOICE",
      direction: call.direction.toUpperCase(),
      eventType: normalizedStatus === "voicemail" ? "VOICEMAIL" : "CALL",
      sourceType: "CALL_LOG",
      sourceId: call.id,
      subject: `${call.direction} ${normalizedStatus === "voicemail" ? "voicemail" : "call"}`,
      summary: call.aiSummary || `${call.direction} call: ${call.status}`,
      occurredAt: call.createdAt,
      metadata: {
        status: call.status,
        duration: call.duration,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        hasTranscript: Boolean(call.transcript),
      },
    },
  })

  if (!needsCallback) return

  await prisma.task.upsert({
    where: { zohoId: `voice_callback_${call.id}` },
    update: {
      ownerId: account.ownerId,
      accountId: call.accountId,
      dueDate: new Date(Date.now() + 10 * 60 * 1000),
      priority: "High",
    },
    create: {
      zohoId: `voice_callback_${call.id}`,
      subject: `Priority callback: ${account.name}`,
      description: normalizedStatus === "voicemail"
        ? "Inbound voicemail requires review and callback. Check the recording/transcript before calling."
        : "Missed inbound call requires a callback within 10 minutes.",
      status: "Not Started",
      priority: "High",
      dueDate: new Date(Date.now() + 10 * 60 * 1000),
      ownerId: account.ownerId,
      accountId: call.accountId,
      type: "Call",
    },
  })

  const existing = await prisma.automationRecommendation.findFirst({
    where: {
      accountId: call.accountId,
      triggerType: "MISSED_INBOUND_CALL",
      status: "PROPOSED",
      evidence: { path: ["sourceId"], equals: call.id },
    },
    select: { id: true },
  })
  if (!existing) {
    await prisma.automationRecommendation.create({
      data: {
        accountId: call.accountId,
        proposedById: call.authorId,
        title: "Standardize missed-call response",
        rationale: "A missed inbound call or voicemail required an immediate callback task. Review whether this should become the standard workflow.",
        triggerType: "MISSED_INBOUND_CALL",
        conditions: { direction: "INBOUND", statuses: ["missed", "no_answer", "voicemail"] },
        actions: [
          { type: "CREATE_TASK", priority: "High", dueInMinutes: 10 },
          { type: "DRAFT_SMS", requiresHumanApproval: true },
        ],
        evidence: { sourceType: "CALL_LOG", sourceId: call.id },
        simulation: { executionMode: "DRAFT_ONLY", customerMessagesSent: 0 },
        mode: "DRAFT_ONLY",
      },
    })
  }
}

export async function upsertCommunicationEvent(data: Prisma.CommunicationEventCreateInput) {
  return prisma.communicationEvent.upsert({
    where: {
      sourceType_sourceId_eventType: {
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        eventType: data.eventType,
      },
    },
    update: {
      subject: data.subject,
      summary: data.summary,
      occurredAt: data.occurredAt,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
    create: data,
  })
}
