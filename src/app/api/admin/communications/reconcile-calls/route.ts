import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { normalizeVoicePhone } from "@/lib/voice-account-matching"

async function reconcile(apply: boolean) {
  const calls = await prisma.callLog.findMany({
    select: { id: true, zohoCallId: true, accountId: true, contactId: true, direction: true, fromNumber: true, toNumber: true, transcript: true },
    orderBy: { createdAt: "asc" },
  })
  const holding = await prisma.account.findUnique({ where: { zohoId: "unknown-voice-caller" }, select: { id: true } })
  const contacts = await prisma.contact.findMany({ select: { id: true, accountId: true, phone: true, mobilePhone: true } })
  const phoneMap = new Map<string, Array<{ id: string; accountId: string }>>()
  for (const contact of contacts) for (const value of [contact.phone, contact.mobilePhone]) {
    const phone = normalizeVoicePhone(value)
    if (phone.length === 10) phoneMap.set(phone, [...(phoneMap.get(phone) || []), { id: contact.id, accountId: contact.accountId }])
  }
  const totals = { calls: calls.length, transcripts: 0, confirmed: 0, repaired: 0, repairable: 0, ambiguous: 0, unresolved: 0, holding: 0 }

  for (const call of calls) {
    if (call.transcript?.trim()) totals.transcripts++
    if (holding?.id === call.accountId) totals.holding++
    const external = call.direction.toUpperCase() === "INBOUND" ? call.fromNumber : call.toNumber
    const normalized = normalizeVoicePhone(external)
    const matches = phoneMap.get(normalized) || []
    const accounts = new Set(matches.map(match => match.accountId))
    const match = accounts.size === 1
      ? { status: "MATCHED" as const, normalized, accountId: matches[0].accountId, contactId: matches[0].id, matches }
      : { status: accounts.size > 1 ? "AMBIGUOUS" as const : "UNRESOLVED" as const, normalized, matches }
    if (match.status === "MATCHED") {
      if (match.accountId === call.accountId) { totals.confirmed++; continue }
      totals.repairable++
      if (apply) {
        await prisma.$transaction(async tx => {
          await tx.callLog.update({ where: { id: call.id }, data: { accountId: match.accountId, contactId: match.contactId } })
          await tx.communicationEvent.updateMany({ where: { sourceId: call.id, sourceType: { in: ["CALL_LOG", "CallLog"] } }, data: { accountId: match.accountId, contactId: match.contactId } })
          await tx.salesCommitment.updateMany({ where: { sourceId: call.id, sourceType: "CALL_LOG" }, data: { accountId: match.accountId, contactId: match.contactId } })
          await tx.integrationException.upsert({
            where: { integration_entityType_externalId_exceptionType: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: call.zohoCallId || call.id, exceptionType: "ACCOUNT_MATCH" } },
            update: { status: "RESOLVED", resolvedEntityId: match.accountId, resolvedBy: "DETERMINISTIC_PHONE_MATCH", resolvedAt: new Date(), confidence: 1 },
            create: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: call.zohoCallId || call.id, exceptionType: "ACCOUNT_MATCH", status: "RESOLVED", summary: "Call reassigned by unique normalized 10-digit contact phone match.", resolvedEntityId: match.accountId, resolvedBy: "DETERMINISTIC_PHONE_MATCH", resolvedAt: new Date(), confidence: 1 },
          })
        })
        totals.repaired++
      }
      continue
    }
    if (match.status === "AMBIGUOUS") totals.ambiguous++
    else totals.unresolved++
    if (apply) {
      await prisma.integrationException.upsert({
        where: { integration_entityType_externalId_exceptionType: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: call.zohoCallId || call.id, exceptionType: "ACCOUNT_MATCH" } },
        update: { status: "OPEN", summary: match.status === "AMBIGUOUS" ? "Multiple accounts share this call phone number; administrator review required." : "No account contact has this call phone number; administrator review required.", proposedMatches: match.matches.map(item => ({ accountId: item.accountId, contactId: item.id })) },
        create: { integration: "ZOHO_VOICE", entityType: "CALL_LOG", externalId: call.zohoCallId || call.id, externalNumber: match.normalized, exceptionType: "ACCOUNT_MATCH", summary: match.status === "AMBIGUOUS" ? "Multiple accounts share this call phone number; administrator review required." : "No account contact has this call phone number; administrator review required.", proposedMatches: match.matches.map(item => ({ accountId: item.accountId, contactId: item.id })), confidence: 0 },
      })
    }
  }
  return totals
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  return NextResponse.json({ success: true, ...(await reconcile(false)) })
}

export async function POST() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  return NextResponse.json({ success: true, ...(await reconcile(true)) })
}
