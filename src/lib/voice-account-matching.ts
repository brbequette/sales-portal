import { prisma } from "@/lib/prisma"

export function normalizeVoicePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1)
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export async function matchVoiceCallToAccount(input: { direction?: unknown; fromNumber?: unknown; toNumber?: unknown }) {
  const direction = String(input.direction || "OUTBOUND").toUpperCase()
  const externalNumber = direction === "INBOUND" ? input.fromNumber : input.toNumber
  const normalized = normalizeVoicePhone(externalNumber)
  if (normalized.length < 10) return { status: "UNRESOLVED" as const, normalized, matches: [] }

  const suffix = normalized.slice(-7)
  const candidates = await prisma.contact.findMany({
    where: { OR: [{ phone: { contains: suffix } }, { mobilePhone: { contains: suffix } }] },
    select: { id: true, accountId: true, phone: true, mobilePhone: true },
    take: 50,
  })
  const matches = candidates.filter(contact =>
    [contact.phone, contact.mobilePhone].some(phone => normalizeVoicePhone(phone) === normalized),
  )
  const accounts = new Set(matches.map(match => match.accountId))
  if (accounts.size === 1) {
    const accountId = matches[0].accountId
    const contact = matches.find(match => match.accountId === accountId)!
    return { status: "MATCHED" as const, normalized, accountId, contactId: contact.id, matches }
  }
  return { status: accounts.size > 1 ? "AMBIGUOUS" as const : "UNRESOLVED" as const, normalized, matches }
}

export function transcriptText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const data = payload as Record<string, unknown>
  const raw = data.transcribeObj || data.transcription || data.transcript || data.data
  if (typeof raw === "string") {
    try { return transcriptText(JSON.parse(raw)) || raw.trim() } catch { return raw.trim() }
  }
  if (Array.isArray(raw)) return raw.map(item => transcriptText(item)).filter(Boolean).join("\n")
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>
    const segments = record.transcript || record.transcripts || record.segments
    if (Array.isArray(segments)) return segments.map(segment => typeof segment === "string" ? segment : String((segment as Record<string, unknown>)?.transcript || (segment as Record<string, unknown>)?.text || "")).filter(Boolean).join("\n")
  }
  return ""
}
