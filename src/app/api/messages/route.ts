import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdministratorRole } from '@/lib/roles'
import { Prisma } from '@prisma/client'

const accountSelect = {
  id: true,
  zohoId: true,
  name: true,
  ownerId: true,
  updatedAt: true,
  smsMessages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      body: true,
      direction: true,
      createdAt: true,
      campaignBlastId: true,
      campaignBlast: { select: { id: true, name: true } },
    },
  },
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const actorId = session.user.dbId || session.user.id
    const isAdmin = isAdministratorRole(session.user.role)
    const { searchParams } = new URL(req.url)
    const campaignBlastId = searchParams.get('campaignBlastId')
    const incomingOnly = searchParams.get('incomingOnly') === 'true'
    const messageFilter = incomingOnly ? { direction: 'INBOUND' } : {}
    const selectedAccount = { ...accountSelect, smsMessages: { ...accountSelect.smsMessages, where: messageFilter } }

    if (searchParams.get('checkOnly') === 'true') {
      const ownerFilter = isAdmin
        ? Prisma.empty
        : Prisma.sql`AND a."ownerId" = ${actorId}`
      const [summary] = await prisma.$queryRaw<Array<{ count: number; latest: Date | null }>>(Prisma.sql`
        SELECT COUNT(DISTINCT sm."accountId")::int AS count,
               MAX(sm."createdAt") AS latest
        FROM "SmsMessage" sm
        JOIN "Account" a ON a.id = sm."accountId"
        WHERE (${incomingOnly} = false OR sm.direction = 'INBOUND')
        ${ownerFilter}
      `)
      return NextResponse.json({
        success: true,
        checkOnly: true,
        count: summary?.count || 0,
        latestUpdatedAt: summary?.latest || null,
      })
    }

    if (searchParams.get('getCampaigns') === 'true') {
      const campaigns = await prisma.campaignBlast.findMany({
        where: isAdmin ? {} : { authorId: actorId },
        select: {
          id: true,
          name: true,
          channel: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      })
      return NextResponse.json({ success: true, campaigns })
    }

    if (campaignBlastId) {
      const campaign = await prisma.campaignBlast.findUnique({
        where: { id: campaignBlastId },
        select: { authorId: true },
      })
      if (!campaign || (!isAdmin && campaign.authorId !== actorId)) {
        return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
      }

      const logs = await prisma.campaignLog.findMany({
        where: {
          campaignBlastId,
          ...(isAdmin ? {} : { account: { ownerId: actorId } }),
        },
        select: {
          status: true,
          errorMessage: true,
          sentAt: true,
          account: { select: accountSelect },
        },
        orderBy: { sentAt: 'desc' },
      })
      // A later outbound follow-up must not erase an earlier reply. Only
      // received messages after a successful send qualify for this effort.
      const sentAtByAccount = new Map<string, Date>()
      for (const log of logs) {
        if (log.status !== 'SUCCESS') continue
        const previous = sentAtByAccount.get(log.account.id)
        if (!previous || log.sentAt < previous) sentAtByAccount.set(log.account.id, log.sentAt)
      }
      const replies = sentAtByAccount.size ? await prisma.smsMessage.findMany({
        where: { accountId: { in: [...sentAtByAccount.keys()] }, direction: 'INBOUND' },
        distinct: ['accountId'],
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { ...accountSelect.smsMessages.select, accountId: true },
      }) : []
      const replyByAccount = new Map(replies.filter(reply => reply.createdAt > sentAtByAccount.get(reply.accountId)!).map(reply => [reply.accountId, reply]))
      const uniqueAccounts = new Map<string, any>()
      for (const log of logs) {
        if (uniqueAccounts.has(log.account.id)) continue
        const reply = replyByAccount.get(log.account.id)
        if (incomingOnly && !reply) continue
        uniqueAccounts.set(log.account.id, {
          ...log.account,
          campaignStatus: log.status,
          campaignErrorMessage: log.errorMessage,
          hasReplied: Boolean(reply),
          latestReply: reply || null,
          ...(incomingOnly ? { smsMessages: [reply] } : {}),
        })
      }
      const accounts = [...uniqueAccounts.values()].sort((a, b) =>
        (b.smsMessages[0]?.createdAt?.getTime() || 0) - (a.smsMessages[0]?.createdAt?.getTime() || 0))
      return NextResponse.json({ success: true, accounts })
    }

    // Select newest matching conversations before limiting, not an arbitrary
    // account batch followed by a client-side incoming filter.
    const ownerFilter = isAdmin ? Prisma.empty : Prisma.sql`AND a."ownerId" = ${actorId}`
    const newest = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a.id FROM "Account" a JOIN "SmsMessage" sm ON sm."accountId" = a.id
      WHERE (${incomingOnly} = false OR sm.direction = 'INBOUND') ${ownerFilter}
      GROUP BY a.id ORDER BY MAX(sm."createdAt") DESC, a.id LIMIT 1000
    `)
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: newest.map(account => account.id) },
        ...(isAdmin ? {} : { ownerId: actorId }),
        smsMessages: { some: messageFilter },
      },
      select: selectedAccount,
    })
    accounts.sort((a, b) =>
      (b.smsMessages[0]?.createdAt?.getTime() || 0) - (a.smsMessages[0]?.createdAt?.getTime() || 0)
    )

    return NextResponse.json({ success: true, accounts })
  } catch (error: any) {
    console.error('Fetch Messages Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
