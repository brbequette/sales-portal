import { prisma } from "@/lib/prisma"

export function normalizeVoicePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1)
  // Never truncate an international number into an unrelated US number.
  return digits.length === 10 ? digits : ""
}
const titanRoutingNumbers = ["8556750511", "6028479868", "9282645832", "4804702577", "4804627988"]
export function isVoiceBusinessNumber(value: unknown) {
  const normalized = normalizeVoicePhone(value)
  const configured = (process.env.VOICE_BUSINESS_NUMBERS || "").split(",").map(normalizeVoicePhone)
  return Boolean(normalized) && [...titanRoutingNumbers, ...configured].includes(normalized)
}
type Contact = { id: string; accountId: string; phone: string | null; mobilePhone: string | null }
type Input = { direction?: unknown; fromNumber?: unknown; toNumber?: unknown }
export function matchVoiceContacts(input: Input, contacts: Contact[]) {
  const direction = String(input.direction || "").toUpperCase()
  const externalNumber = direction === "INBOUND" ? input.fromNumber : input.toNumber
  const normalized = normalizeVoicePhone(externalNumber)
  if (!["INBOUND", "OUTBOUND"].includes(direction) || !normalized || isVoiceBusinessNumber(normalized)) return { status: "UNRESOLVED" as const, normalized, matches: [] as Contact[] }
  const matches = contacts.filter(contact => [contact.phone, contact.mobilePhone].some(phone => normalizeVoicePhone(phone) === normalized))
  const accounts = new Set(matches.map(match => match.accountId))
  if (accounts.size === 1) return { status: "MATCHED" as const, normalized, accountId: matches[0].accountId, contactId: matches.length === 1 ? matches[0].id : null, matches }
  return { status: accounts.size > 1 ? "AMBIGUOUS" as const : "UNRESOLVED" as const, normalized, matches }
}
export async function matchVoiceCallToAccount(input: Input) {
  // Evaluate the complete normalized set: a truncated suffix search cannot
  // establish uniqueness and misses formatted phone numbers.
  const contacts = await prisma.contact.findMany({ select: { id: true, accountId: true, phone: true, mobilePhone: true } })
  return matchVoiceContacts(input, contacts)
}
export { transcriptText } from "./voice-transcript"
