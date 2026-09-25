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

export async function indexCallAndCreateSafeFollowUp(call: CallAutomationInput, db: Prisma.TransactionClient = prisma) {
  const account = await db.account.findUnique({
    where: { id: call.accountId },
    select: { ownerId: true, name: true, zohoId: true },
  })
  if (!account) return

  const normalizedStatus = call.status.toLowerCase()
  const isInbound = call.direction.toUpperCase() === "INBOUND"
  const needsCallback = isInbound && ["missed", "no_answer", "no answer", "voicemail"].includes(normalizedStatus)

  await db.communicationEvent.upsert({
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

  // Keep the event for reconciliation, but never schedule customer work against
  // the shared holding account while the caller's identity is unresolved.
  if (!needsCallback || account.zohoId === "unknown-voice-caller") return

  await db.task.upsert({
    where: { zohoId: `voice_callback_${call.id}` },
    // A replay must not undo a user's reassignment, deadline, or completion.
    update: {},
    create: {
      zohoId: `voice_callback_${call.id}`,
      subject: `Priority callback: ${account.name}`,
      description: normalizedStatus === "voicemail"
        ? "Inbound voicemail requires review and callback. Check the recording/transcript before calling."
        : "Missed inbound call requires a callback within 10 minutes.",
      status: "Not Started",
      priority: "High",
      dueDate: new Date(call.createdAt.getTime() + 10 * 60 * 1000),
      ownerId: account.ownerId,
      accountId: call.accountId,
      type: "Call",
    },
  })

  const existing = await db.automationRecommendation.findFirst({
    where: {
      accountId: call.accountId,
      triggerType: "MISSED_INBOUND_CALL",
      evidence: { path: ["sourceId"], equals: call.id },
    },
    select: { id: true },
  })
  if (!existing) {
    await db.automationRecommendation.upsert({
      where: { id: `voice_callback_recommendation_${call.id}` },
      update: {},
      create: {
        id: `voice_callback_recommendation_${call.id}`,
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
