import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const accountIds = ["cmppahwp200aslsi0lyenvnvd", "cmruh5urq0bjcrew8vy1d1yom"]

try {
  const before = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, name: true, zohoId: true },
  })
  if (before.length !== accountIds.length) throw new Error(`Expected exactly ${accountIds.length} confirmed accounts; found ${before.length}.`)

  const result = await prisma.$transaction(async tx => {
    const dealIds = (await tx.deal.findMany({ where: { accountId: { in: accountIds } }, select: { id: true } })).map(row => row.id)
    if (dealIds.length) await tx.dealAutomationState.deleteMany({ where: { dealId: { in: dealIds } } })
    await tx.communicationEvent.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.salesCommitment.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.automationRecommendation.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.campaignLog.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.scheduledMessage.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.smsMessage.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.callLog.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.note.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.task.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.deal.deleteMany({ where: { accountId: { in: accountIds } } })
    await tx.contact.deleteMany({ where: { accountId: { in: accountIds } } })
    return tx.account.deleteMany({ where: { id: { in: accountIds } } })
  })
  const remaining = await prisma.account.count({ where: { id: { in: accountIds } } })
  console.log(JSON.stringify({ deletedAccounts: result.count, remaining, names: before.map(row => row.name) }))
} finally {
  await prisma.$disconnect()
}
