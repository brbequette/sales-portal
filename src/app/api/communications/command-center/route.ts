import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkAccountOwnership } from "@/lib/auth-helpers"

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId")?.trim()
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 })

  const access = await checkAccountOwnership(accountId)
  if (!access.authorized) return access.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [callsToday, missedCalls, voicemails, emailsNeedingResponse, inboundMessages, openCommitments, mailbox] = await Promise.all([
    prisma.callLog.count({ where: { accountId, createdAt: { gte: startOfDay } } }),
    prisma.callLog.count({ where: { accountId, status: { contains: "miss", mode: "insensitive" } } }),
    prisma.callLog.count({ where: { accountId, status: { contains: "voicemail", mode: "insensitive" } } }),
    prisma.email.count({ where: { accountId, needsResponse: true, status: { not: "ARCHIVED" } } }),
    prisma.smsMessage.count({ where: { accountId, direction: "INBOUND", status: { notIn: ["READ", "ARCHIVED"] } } }),
    prisma.salesCommitment.count({ where: { accountId, status: { in: ["PROPOSED", "APPROVED", "OPEN"] } } }),
    prisma.emailMailbox.findFirst({
      where: { enabled: true },
      orderBy: [{ lastSyncAt: "desc" }, { updatedAt: "desc" }],
      select: { address: true, lastSyncAt: true, lastSyncStatus: true, lastSyncError: true },
    }),
  ])

  return NextResponse.json({
    success: true,
    metrics: { callsToday, missedCalls, voicemails, emailsNeedingResponse, inboundMessages, openCommitments },
    connections: {
      voiceWebSdk: Boolean(process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim()),
      voiceOAuth: Boolean(process.env.ZOHO_VOICE_REFRESH_TOKEN?.trim()),
      sms: Boolean(process.env.ZOHO_VOICE_REFRESH_TOKEN?.trim()),
      emailIngestion: Boolean(mailbox),
    },
    mailbox,
    generatedAt: new Date().toISOString(),
  })
}
