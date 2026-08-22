import { prisma } from "../src/lib/prisma"

const relationCounts = async (id: string) => ({
  accounts: await prisma.account.count({ where: { ownerId: id } }),
  deals: await prisma.deal.count({ where: { ownerId: id } }),
  notes: await prisma.note.count({ where: { authorId: id } }),
  tasks: await prisma.task.count({ where: { ownerId: id } }),
  payouts: await prisma.payout.count({ where: { repId: id } }),
  monthlyVigGoals: await prisma.monthlyVigGoal.count({ where: { repId: id } }),
  timeEntries: await prisma.timeEntry.count({ where: { userId: id } }),
  timeChangeRequests: await prisma.timeChangeRequest.count({ where: { userId: id } }),
  campaignBlasts: await prisma.campaignBlast.count({ where: { authorId: id } }),
  campaignJobs: await prisma.campaignJob.count({ where: { authorId: id } }),
  smsMessages: await prisma.smsMessage.count({ where: { authorId: id } }),
  callLogs: await prisma.callLog.count({ where: { authorId: id } }),
  pushSubscriptions: await prisma.pushSubscription.count({ where: { userId: id } }),
  notifications: await prisma.notification.count({ where: { userId: id } }),
  advances: await prisma.advance.count({ where: { userId: id } }),
  reimbursements: await prisma.reimbursement.count({ where: { userId: id } }),
  leadsOwned: await prisma.lead.count({ where: { ownerId: id } }),
  leadsClaimed: await prisma.lead.count({ where: { claimedById: id } }),
  scheduledMessages: await prisma.scheduledMessage.count({ where: { authorId: id } }),
  clawbacks: await prisma.clawbackTransaction.count({ where: { repId: id } }),
  compensationPlans: await prisma.compensationPlan.count({ where: { repId: id } }),
  basePayEarnings: await prisma.basePayEarning.count({ where: { repId: id } }),
  performanceBonuses: await prisma.performanceGoalBonus.count({ where: { repId: id } }),
})

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: "Bequette", mode: "insensitive" } },
        { name: { contains: "Benjamin", mode: "insensitive" } },
        { name: { contains: "Ben ", mode: "insensitive" } },
        { email: { contains: "bequette", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, zohoId: true, showOnSalesBoard: true, createdAt: true, updatedAt: true },
  })

  const audited = []
  for (const user of users) audited.push({ user, counts: await relationCounts(user.id) })
  console.log(JSON.stringify({ matchedUsers: audited.length, audited }, null, 2))
}

main().finally(() => prisma.$disconnect())
