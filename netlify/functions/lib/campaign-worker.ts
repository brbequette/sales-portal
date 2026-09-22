/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto"
import { prisma } from "./prisma"
import { getZohoVoiceAccessToken } from "./zoho-voice-auth"
import { evaluateZohoSmsResponse } from "./zoho-sms-response"
import { buildZohoSmsFormData, loadZohoMmsMedia } from "./zoho-mms-media"
import { classifyProviderOutcome } from "./campaign-deliverability"
import { guardSmsSend } from "../../../src/lib/sms-suppression"

const LEASE_MS = 90_000

export async function recoverInterruptedRecipients(now = new Date()) {
  await prisma.campaignRecipient.updateMany({ where: { state: "LEASED", leaseExpiresAt: { lt: now } }, data: { state: "PENDING", leaseOwner: null, leaseExpiresAt: null, dispositionReason: "Expired pre-send lease recovered" } })
  const interrupted = await prisma.campaignRecipient.findMany({ where: { state: "SENDING", leaseExpiresAt: { lt: now } }, select: { id: true, lastAttemptId: true } })
  for (const recipient of interrupted) await prisma.$transaction([
    prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "AMBIGUOUS", ambiguousAt: now, leaseOwner: null, leaseExpiresAt: null, dispositionReason: "Worker disappeared after provider submission began" } }),
    ...(recipient.lastAttemptId ? [prisma.campaignAttempt.update({ where: { id: recipient.lastAttemptId }, data: { state: "AMBIGUOUS", completedAt: now, interruptionReason: "Lease expired after SENDING" } })] : []),
  ])
}

async function claim(jobId: string, workerId: string) {
  const lease = new Date(Date.now() + LEASE_MS)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "CampaignRecipient" SET "state"='LEASED', "leaseOwner"=${workerId}, "leaseExpiresAt"=${lease}, "attemptCount"="attemptCount"+1, "updatedAt"=NOW()
    WHERE "id"=(SELECT "id" FROM "CampaignRecipient" WHERE "campaignJobId"=${jobId} AND "state"='PENDING' ORDER BY "originalIndex" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING "id"`
  if (!rows[0]) return null
  return prisma.campaignRecipient.findUnique({ where: { id: rows[0].id }, include: { campaignJob: true } })
}

export async function processCampaignBatch(jobId: string, batchSize = 1) {
  const workerId = `${process.env.DEPLOY_ID || process.env.BUILD_ID || "local"}:${crypto.randomUUID()}`
  const job = await prisma.campaignJob.findUnique({ where: { id: jobId } })
  if (!job || !["QUEUED", "RUNNING", "RECOVERING"].includes(job.status)) return { processed: 0 }
  if (job.status === "LEGACY_QUARANTINED") return { processed: 0 }
  await prisma.campaignJob.update({ where: { id: jobId }, data: { status: job.status === "QUEUED" ? "RUNNING" : job.status, workerHeartbeatAt: new Date() } })
  const accessToken = await getZohoVoiceAccessToken()
  if (!accessToken) throw new Error("Zoho Voice authentication unavailable")
  const media = job.imageUrl ? await loadZohoMmsMedia(job.imageUrl) : null
  let processed = 0
  for (; processed < batchSize; processed++) {
    const recipient = await claim(jobId, workerId)
    if (!recipient) break
    const guard = await guardSmsSend({ phone: recipient.normalizedPhone || "", traffic: "PROMOTIONAL" })
    if (!guard.allowed) {
      await prisma.$transaction([
        prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "SKIPPED", skippedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, dispositionReason: guard.reason } }),
        prisma.campaignJob.update({ where: { id: jobId }, data: { currentIndex: { increment: 1 }, workerHeartbeatAt: new Date() } }),
      ])
      continue
    }
    const attemptId = crypto.randomUUID(); const sendingAt = new Date()
    await prisma.$transaction([
      prisma.campaignAttempt.create({ data: { id: attemptId, campaignRecipientId: recipient.id, workerId, state: "SENDING", sendingAt, normalizedRecipient: recipient.normalizedPhone!, sender: job.fromNumber || "", deploymentId: process.env.DEPLOY_ID || process.env.BUILD_ID || null } }),
      prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "SENDING", lastAttemptId: attemptId, leaseExpiresAt: new Date(Date.now() + LEASE_MS) } }),
    ])
    try {
      const form = buildZohoSmsFormData({ customerNumber: recipient.normalizedPhone!, message: job.text || job.campaignName, senderId: job.fromNumber || "", media })
      const response = await fetch(`https://voice.zoho.${process.env.ZOHO_DC || "com"}/rest/json/v2/sms/send`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" }, body: form })
      const text = await response.text(); let payload: any = {}; try { payload = JSON.parse(text) } catch {}
      const outcome = evaluateZohoSmsResponse(response, text); const completedAt = new Date()
      const code = String(payload?.code || "") || null; const status = String(payload?.status || payload?.data?.status || "") || null; const message = String(payload?.message || outcome.errorMessage || "") || null
      const providerData = { lastProviderHttpStatus: response.status, lastProviderCode: code, lastProviderStatus: status, lastProviderMessage: message, lastProviderLogId: payload?.logId ? String(payload.logId) : null, lastProviderMmsId: payload?.mmsId ? String(payload.mmsId) : null }
      if (outcome.accepted) {
        await prisma.$transaction([
          prisma.campaignAttempt.update({ where: { id: attemptId }, data: { state: "ACCEPTED", providerResponseAt: completedAt, completedAt, providerHttpStatus: response.status, zohoCode: code, zohoStatus: status, zohoMessage: message, zohoLogId: providerData.lastProviderLogId, zohoMmsId: providerData.lastProviderMmsId } }),
          prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "ACCEPTED", deliveryStatus: "submitted", acceptedAt: completedAt, leaseOwner: null, leaseExpiresAt: null, ...providerData } }),
          prisma.campaignJob.update({ where: { id: jobId }, data: { sentCount: { increment: 1 }, currentIndex: { increment: 1 }, workerHeartbeatAt: completedAt } }),
          prisma.campaignBlast.update({ where: { id: job.blastId! }, data: { sentCount: { increment: 1 } } }),
          prisma.campaignLog.create({ data: { campaignBlastId: job.blastId!, accountId: recipient.accountId!, contactId: recipient.contactId, status: "SUCCESS", zohoNumberUsed: job.fromNumber } }),
          prisma.smsMessage.create({ data: { accountId: recipient.accountId!, contactId: recipient.contactId, authorId: job.authorId, fromNumber: job.fromNumber || "", toNumber: recipient.normalizedPhone!, body: job.text || job.campaignName, direction: "OUTBOUND", mediaUrl: job.imageUrl, campaignBlastId: job.blastId, zohoLogId: outcome.providerId, status: "SUBMITTED" } }),
        ])
      } else {
        const classification = classifyProviderOutcome(code, status, message)
        await prisma.$transaction([
          prisma.campaignAttempt.update({ where: { id: attemptId }, data: { state: "FAILED", providerResponseAt: completedAt, completedAt, providerHttpStatus: response.status, zohoCode: code, zohoStatus: status, zohoMessage: message } }),
          prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "FAILED", deliveryStatus: "rejected", failedAt: completedAt, leaseOwner: null, leaseExpiresAt: null, dispositionReason: classification.reason, ...providerData } }),
          prisma.campaignJob.update({ where: { id: jobId }, data: { failedCount: { increment: 1 }, currentIndex: { increment: 1 }, workerHeartbeatAt: completedAt } }),
          prisma.campaignBlast.update({ where: { id: job.blastId! }, data: { failedCount: { increment: 1 } } }),
          prisma.campaignLog.create({ data: { campaignBlastId: job.blastId!, accountId: recipient.accountId!, contactId: recipient.contactId, status: "FAILED", errorMessage: message, zohoNumberUsed: job.fromNumber } }),
          prisma.phoneDeliverability.upsert({ where: { normalizedPhone_channel: { normalizedPhone: recipient.normalizedPhone!, channel: "SMS" } }, create: { normalizedPhone: recipient.normalizedPhone!, channel: "SMS", deliverabilityStatus: classification.deliverability as any, suppressionStatus: classification.suppression as any, suppressionReason: classification.reason, providerCode: code, providerMessage: message, sourceCampaignJobId: jobId, sourceRecipientId: recipient.id, sourceAttemptId: attemptId, firstFailureAt: completedAt, mostRecentFailureAt: completedAt, lastCheckedAt: completedAt, consecutiveFailureCount: 1 }, update: { deliverabilityStatus: classification.deliverability as any, suppressionStatus: classification.suppression as any, suppressionReason: classification.reason, providerCode: code, providerMessage: message, sourceCampaignJobId: jobId, sourceRecipientId: recipient.id, sourceAttemptId: attemptId, mostRecentFailureAt: completedAt, lastCheckedAt: completedAt, consecutiveFailureCount: { increment: 1 } } }),
        ])
      }
    } catch (error: any) {
      const at = new Date(); await prisma.$transaction([prisma.campaignAttempt.update({ where: { id: attemptId }, data: { state: "AMBIGUOUS", completedAt: at, interruptionReason: error?.message || "Provider outcome unavailable" } }), prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { state: "AMBIGUOUS", ambiguousAt: at, leaseOwner: null, leaseExpiresAt: null, dispositionReason: "Provider submission outcome is ambiguous" } })])
    }
  }
  const remaining = await prisma.campaignRecipient.count({ where: { campaignJobId: jobId, state: { in: ["PENDING", "LEASED", "SENDING"] } } })
  if (!remaining) {
    const errors = await prisma.campaignRecipient.count({ where: { campaignJobId: jobId, state: { in: ["FAILED", "AMBIGUOUS"] } } })
    await prisma.campaignJob.update({ where: { id: jobId }, data: { status: errors ? "COMPLETED_WITH_ERRORS" : "COMPLETED", reviewState: "AWAITING_DELIVERY_RECEIPTS", submissionCompletedAt: new Date() } })
  }
  return { processed }
}
