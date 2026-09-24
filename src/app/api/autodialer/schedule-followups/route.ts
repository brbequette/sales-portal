import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkAccountOwnership } from "@/lib/auth-helpers"

const merge = (text: string, values: Record<string, string>) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), text)

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const actorId = String((session.user as { dbId?: string; id?: string }).dbId || (session.user as { id?: string }).id || "")
  if (!actorId) return NextResponse.json({ error: "User record is unavailable" }, { status: 400 })
  const { accountId, contactId, plan } = await request.json()
  const access = await checkAccountOwnership(String(accountId || ""))
  if (!access.authorized) return access.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const account = await prisma.account.findFirst({ where: { OR: [{ id: String(accountId) }, { zohoId: String(accountId) }] }, include: { contacts: true, owner: true } })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  const contacts = contactId
    ? account.contacts.filter(contact => contact.id === contactId)
    : (plan.contactMode === "ALL" ? account.contacts : [account.contacts.find(contact => contact.isPrimary) || account.contacts[0]].filter(Boolean))
  const now = Date.now()
  let created = 0
  for (const contact of contacts) {
    const values = { contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "there", accountName: account.name, repName: session.user.name || account.owner?.name || "Titan Diamond USA" }
    if (plan.smsEnabled && (contact.mobilePhone || contact.phone)) {
      await prisma.scheduledMessage.create({ data: { accountId: account.id, contactId: contact.id, authorId: actorId, channel: "SMS", fromNumber: process.env.ZOHO_VOICE_FROM_NUMBER || "+14804702577", body: merge(String(plan.smsBody || ""), values), scheduledTime: new Date(now + Math.max(0, Number(plan.smsDelayHours) || 0) * 3600000) } })
      created++
    }
    if (plan.emailEnabled && contact.email) {
      await prisma.scheduledMessage.create({ data: { accountId: account.id, contactId: contact.id, authorId: actorId, channel: "EMAIL", fromNumber: String(plan.emailSubject || "Following up from Titan Diamond USA"), body: merge(String(plan.emailBody || ""), values), scheduledTime: new Date(now + Math.max(0, Number(plan.emailDelayHours) || 0) * 3600000) } })
      created++
    }
  }
  return NextResponse.json({ success: true, scheduled: created })
}
