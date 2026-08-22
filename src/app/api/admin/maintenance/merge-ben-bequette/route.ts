import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60

const CONFIRMATION = "MERGE BEN BEQUETTE ACCOUNTS"

const BEN_MATCH = {
  OR: [
    { name: { contains: "Bequette", mode: "insensitive" as const } },
    { email: { contains: "bequette", mode: "insensitive" as const } },
  ],
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  zohoId: true,
  showOnSalesBoard: true,
  createdAt: true,
  updatedAt: true,
} as const

async function relationCounts(id: string) {
  const rows = await prisma.$queryRaw<Array<Record<string, bigint>>>(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "Account" WHERE "ownerId" = ${id}) accounts,
      (SELECT count(*) FROM "Deal" WHERE "ownerId" = ${id}) deals,
      (SELECT count(*) FROM "Note" WHERE "authorId" = ${id}) notes,
      (SELECT count(*) FROM "Task" WHERE "ownerId" = ${id}) tasks,
      (SELECT count(*) FROM "Payout" WHERE "repId" = ${id}) payouts,
      (SELECT count(*) FROM "MonthlyVigGoal" WHERE "repId" = ${id}) monthly_vig_goals,
      (SELECT count(*) FROM "TimeEntry" WHERE "userId" = ${id}) time_entries,
      (SELECT count(*) FROM "TimeChangeRequest" WHERE "userId" = ${id}) time_change_requests,
      (SELECT count(*) FROM "CampaignBlast" WHERE "authorId" = ${id}) campaign_blasts,
      (SELECT count(*) FROM "CampaignJob" WHERE "authorId" = ${id}) campaign_jobs,
      (SELECT count(*) FROM "SmsMessage" WHERE "authorId" = ${id}) sms_messages,
      (SELECT count(*) FROM "CallLog" WHERE "authorId" = ${id}) call_logs,
      (SELECT count(*) FROM "PushSubscription" WHERE "userId" = ${id}) push_subscriptions,
      (SELECT count(*) FROM "Notification" WHERE "userId" = ${id}) notifications,
      (SELECT count(*) FROM "Advance" WHERE "userId" = ${id}) advances,
      (SELECT count(*) FROM "Reimbursement" WHERE "userId" = ${id}) reimbursements,
      (SELECT count(*) FROM "Lead" WHERE "ownerId" = ${id}) leads_owned,
      (SELECT count(*) FROM "Lead" WHERE "claimedById" = ${id}) leads_claimed,
      (SELECT count(*) FROM "ScheduledMessage" WHERE "authorId" = ${id}) scheduled_messages,
      (SELECT count(*) FROM "ClawbackTransaction" WHERE "repId" = ${id}) clawbacks,
      (SELECT count(*) FROM "CompensationPlan" WHERE "repId" = ${id}) compensation_plans,
      (SELECT count(*) FROM "BasePayEarning" WHERE "repId" = ${id}) base_pay_earnings,
      (SELECT count(*) FROM "PerformanceGoalBonus" WHERE "repId" = ${id}) performance_bonuses,
      (SELECT count(*) FROM "AdvanceExtensionRequest" WHERE "requestedBy" = ${id} OR "reviewedBy" = ${id}) advance_extension_requests
  `)
  return Object.fromEntries(Object.entries(rows[0] || {}).map(([key, value]) => [key, Number(value)]))
}

async function audit() {
  const users = await prisma.user.findMany({ where: BEN_MATCH, orderBy: { createdAt: "asc" }, select: userSelect })
  return Promise.all(users.map(async (user) => ({ user, counts: await relationCounts(user.id) })))
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const users = await audit()
  return NextResponse.json({ success: true, matchedUsers: users.length, users, confirmation: CONFIRMATION })
}

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await req.json().catch(() => ({}))
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ success: false, error: `confirmation must equal ${CONFIRMATION}` }, { status: 400 })
  }

  const before = await audit()
  if (before.length < 2) {
    return NextResponse.json({ success: true, alreadyMerged: true, before, after: before })
  }

  const canonical = before.find(({ user }) => Boolean(user.zohoId))?.user
  if (!canonical) {
    return NextResponse.json({ success: false, error: "No Zoho-linked canonical Benjamin Bequette account found" }, { status: 409 })
  }
  const duplicateIds = before.map(({ user }) => user.id).filter((id) => id !== canonical.id)
  if (!duplicateIds.length) return NextResponse.json({ success: true, alreadyMerged: true, before, after: before })

  await prisma.$transaction(async (tx) => {
    // Resolve compound unique keys before moving ordinary foreign keys.
    for (const duplicateId of duplicateIds) {
      const duplicateEntries = await tx.timeEntry.findMany({ where: { userId: duplicateId } })
      for (const entry of duplicateEntries) {
        const existing = await tx.timeEntry.findUnique({ where: { userId_date: { userId: canonical.id, date: entry.date } } })
        if (existing) {
          await tx.timeChangeRequest.updateMany({ where: { timeEntryId: entry.id }, data: { timeEntryId: existing.id, userId: canonical.id } })
          await tx.timeEntry.delete({ where: { id: entry.id } })
        } else {
          await tx.timeEntry.update({ where: { id: entry.id }, data: { userId: canonical.id } })
        }
      }

      const duplicateGoals = await tx.monthlyVigGoal.findMany({ where: { repId: duplicateId } })
      for (const goal of duplicateGoals) {
        const existing = await tx.monthlyVigGoal.findUnique({ where: { repId_monthKey: { repId: canonical.id, monthKey: goal.monthKey } } })
        if (existing) await tx.monthlyVigGoal.delete({ where: { id: goal.id } })
        else await tx.monthlyVigGoal.update({ where: { id: goal.id }, data: { repId: canonical.id } })
      }
    }

    const ids = Prisma.join(duplicateIds)
    const canonicalId = canonical.id
    const updates = [
      Prisma.sql`UPDATE "Account" SET "ownerId" = ${canonicalId} WHERE "ownerId" IN (${ids})`,
      Prisma.sql`UPDATE "Deal" SET "ownerId" = ${canonicalId} WHERE "ownerId" IN (${ids})`,
      Prisma.sql`UPDATE "Note" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "Task" SET "ownerId" = ${canonicalId} WHERE "ownerId" IN (${ids})`,
      Prisma.sql`UPDATE "Payout" SET "repId" = ${canonicalId} WHERE "repId" IN (${ids})`,
      Prisma.sql`UPDATE "TimeChangeRequest" SET "userId" = ${canonicalId} WHERE "userId" IN (${ids})`,
      Prisma.sql`UPDATE "CampaignBlast" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "CampaignJob" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "SmsMessage" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "CallLog" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "PushSubscription" SET "userId" = ${canonicalId} WHERE "userId" IN (${ids})`,
      Prisma.sql`UPDATE "Notification" SET "userId" = ${canonicalId} WHERE "userId" IN (${ids})`,
      Prisma.sql`UPDATE "Advance" SET "userId" = ${canonicalId} WHERE "userId" IN (${ids})`,
      Prisma.sql`UPDATE "Reimbursement" SET "userId" = ${canonicalId} WHERE "userId" IN (${ids})`,
      Prisma.sql`UPDATE "Lead" SET "ownerId" = ${canonicalId} WHERE "ownerId" IN (${ids})`,
      Prisma.sql`UPDATE "Lead" SET "claimedById" = ${canonicalId} WHERE "claimedById" IN (${ids})`,
      Prisma.sql`UPDATE "ScheduledMessage" SET "authorId" = ${canonicalId} WHERE "authorId" IN (${ids})`,
      Prisma.sql`UPDATE "ClawbackTransaction" SET "repId" = ${canonicalId} WHERE "repId" IN (${ids})`,
      Prisma.sql`UPDATE "CompensationPlan" SET "repId" = ${canonicalId} WHERE "repId" IN (${ids})`,
      Prisma.sql`UPDATE "BasePayEarning" SET "repId" = ${canonicalId} WHERE "repId" IN (${ids})`,
      Prisma.sql`UPDATE "PerformanceGoalBonus" SET "repId" = ${canonicalId}, "repName" = 'Benjamin Bequette' WHERE "repId" IN (${ids})`,
      Prisma.sql`UPDATE "AdvanceExtensionRequest" SET "requestedBy" = ${canonicalId} WHERE "requestedBy" IN (${ids})`,
      Prisma.sql`UPDATE "AdvanceExtensionRequest" SET "reviewedBy" = ${canonicalId} WHERE "reviewedBy" IN (${ids})`,
    ]
    for (const statement of updates) await tx.$executeRaw(statement)

    await tx.user.update({
      where: { id: canonicalId },
      data: { name: "Benjamin Bequette", showOnSalesBoard: true },
    })
    await tx.user.deleteMany({ where: { id: { in: duplicateIds } } })
  }, { timeout: 60_000 })

  const after = await audit()
  return NextResponse.json({
    success: true,
    canonicalUserId: canonical.id,
    mergedUserIds: duplicateIds,
    before,
    after,
  })
}
