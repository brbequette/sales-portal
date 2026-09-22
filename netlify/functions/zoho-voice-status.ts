/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { authenticateWebhookToken, authErrorResponse } from "./lib/auth-middleware"
import { classifyProviderOutcome, normalizeDeliveryStatus, normalizeE164 } from "./lib/campaign-deliverability"

const rank: Record<string, number> = { unknown: 0, submitted: 1, queued: 2, sent: 3, delivered: 5, expired: 5, undeliverable: 5, rejected: 5, blocked: 5 }
export const handler: Handler = async event => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "method not allowed" }
  try { authenticateWebhookToken(event, ["ZOHO_VOICE_WEBHOOK_SECRET", "ZOHO_WEBHOOK_SECRET"], ["x-zoho-webhook-token"]) } catch (error) { return authErrorResponse(error, corsHeaders) }
  try {
    const body = JSON.parse(event.body || "{}")
    const providerId = String(body.messageId || body.message_id || body.smsId || body.logId || "")
    const phone = normalizeE164(body.to || body.toNumber || body.customerNumber || "")
    const status = normalizeDeliveryStatus(body.status || body.deliveryStatus)
    const recipient = await prisma.campaignRecipient.findFirst({ where: { OR: [providerId ? { lastProviderLogId: providerId } : undefined, providerId ? { lastProviderMmsId: providerId } : undefined, phone ? { normalizedPhone: phone, state: "ACCEPTED" } : undefined].filter(Boolean) as any }, orderBy: { acceptedAt: "desc" } })
    if (!recipient) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, matched: false }) }
    if ((rank[status] || 0) < (rank[recipient.deliveryStatus] || 0)) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, duplicateOrStale: true }) }
    const now = new Date(); const code = String(body.code || "") || null; const message = String(body.message || body.error || "") || null
    const operations: any[] = [prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { deliveryStatus: status, deliveredAt: status === "delivered" ? now : recipient.deliveredAt, lastProviderCode: code || recipient.lastProviderCode, lastProviderStatus: status, lastProviderMessage: message || recipient.lastProviderMessage } })]
    if (phone && status === "delivered") operations.push(prisma.phoneDeliverability.upsert({ where: { normalizedPhone_channel: { normalizedPhone: phone, channel: "SMS" } }, create: { normalizedPhone: phone, channel: "SMS", deliverabilityStatus: "DELIVERED", lastSuccessfulDeliveryAt: now, lastCheckedAt: now }, update: { deliverabilityStatus: "DELIVERED", lastSuccessfulDeliveryAt: now, lastCheckedAt: now, consecutiveFailureCount: 0 } }))
    if (phone && ["undeliverable","rejected","blocked","expired"].includes(status)) { const c = classifyProviderOutcome(code, status, message); operations.push(prisma.phoneDeliverability.upsert({ where: { normalizedPhone_channel: { normalizedPhone: phone, channel: "SMS" } }, create: { normalizedPhone: phone, channel: "SMS", deliverabilityStatus: c.deliverability as any, suppressionStatus: c.suppression as any, suppressionReason: c.reason, providerCode: code, providerMessage: message, sourceCampaignJobId: recipient.campaignJobId, sourceRecipientId: recipient.id, firstFailureAt: now, mostRecentFailureAt: now, lastCheckedAt: now, consecutiveFailureCount: 1 }, update: { deliverabilityStatus: c.deliverability as any, suppressionStatus: c.suppression as any, suppressionReason: c.reason, providerCode: code, providerMessage: message, mostRecentFailureAt: now, lastCheckedAt: now, consecutiveFailureCount: { increment: 1 } } })) }
    await prisma.$transaction(operations)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, matched: true }) }
  } catch (error: any) { console.error("[zoho-voice-status]", error); return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false }) } }
}
