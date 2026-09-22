import { prisma } from "./prisma"

export type SmsTraffic = "PROMOTIONAL" | "TRANSACTIONAL" | "TEST"
export type SmsGuardDecision = { allowed: boolean; normalizedPhone: string | null; protectedSuppression: boolean; technicalSuppression: boolean; reason: string | null; providerCode: string | null; lastCheckedAt: Date | null }

export function normalizeSmsPhone(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

export async function guardSmsSend(input: { phone: string; traffic: SmsTraffic; administratorId?: string; technicalOverrideReason?: string }): Promise<SmsGuardDecision> {
  const normalizedPhone = normalizeSmsPhone(input.phone)
  if (!normalizedPhone) return { allowed: false, normalizedPhone: null, protectedSuppression: false, technicalSuppression: false, reason: "Missing or invalid E.164 number", providerCode: null, lastCheckedAt: null }
  const record = await prisma.phoneDeliverability.findUnique({ where: { normalizedPhone_channel: { normalizedPhone, channel: "SMS" } } })
  if (!record) return { allowed: true, normalizedPhone, protectedSuppression: false, technicalSuppression: false, reason: null, providerCode: null, lastCheckedAt: null }
  const protectedSuppression = ["OPT_OUT_SUPPRESSED", "LEGAL_SUPPRESSED"].includes(record.suppressionStatus)
  const technicalSuppression = record.suppressionStatus === "TECHNICAL_SUPPRESSED"
  if (protectedSuppression) return { allowed: false, normalizedPhone, protectedSuppression: true, technicalSuppression: false, reason: record.suppressionReason || record.suppressionStatus, providerCode: record.providerCode, lastCheckedAt: record.lastCheckedAt }
  if (!technicalSuppression) return { allowed: true, normalizedPhone, protectedSuppression: false, technicalSuppression: false, reason: null, providerCode: record.providerCode, lastCheckedAt: record.lastCheckedAt }
  if (input.traffic !== "TRANSACTIONAL" || !input.administratorId || !input.technicalOverrideReason?.trim()) return { allowed: false, normalizedPhone, protectedSuppression: false, technicalSuppression: true, reason: record.suppressionReason || "Technical suppression", providerCode: record.providerCode, lastCheckedAt: record.lastCheckedAt }
  await prisma.phoneDeliverabilityReview.create({ data: { phoneDeliverabilityId: record.id, administratorId: input.administratorId, previousDeliverabilityStatus: record.deliverabilityStatus, nextDeliverabilityStatus: record.deliverabilityStatus, previousSuppressionStatus: record.suppressionStatus, nextSuppressionStatus: record.suppressionStatus, reason: `One-send technical override: ${input.technicalOverrideReason.trim()}` } })
  return { allowed: true, normalizedPhone, protectedSuppression: false, technicalSuppression: true, reason: "Explicit audited technical override", providerCode: record.providerCode, lastCheckedAt: record.lastCheckedAt }
}
