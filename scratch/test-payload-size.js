const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Test the exact query shape the API is running
  const accounts = await p.account.findMany({
    where: {},
    orderBy: { name: 'asc' },
    select: {
      id: true,
      zohoId: true,
      name: true,
      tags: true,
      status: true,
      quality: true,
      lastCalledAt: true,
      lastPurchaseAt: true,
      ownerId: true,
      industry: true,
      invoices: {
        where: { status: { notIn: ['Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'Void', 'Draft'] } },
        select: { amount: true }
      },
      contacts: {
        select: { phone: true, mobilePhone: true, isPrimary: true, firstName: true, lastName: true }
      },
      owner: {
        select: { id: true, name: true, email: true, role: true }
      }
    }
  })

  const raw = JSON.stringify(accounts)
  console.log('Raw query result size:', raw.length, 'bytes', `(${(raw.length/1024/1024).toFixed(2)} MB)`)
  console.log('Total accounts:', accounts.length)

  // Now prune it the same way the API does
  const pruned = accounts.map(acc => {
    const totalSales = acc.invoices ? acc.invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0) : 0
    const primaryContact = acc.contacts?.find(c => c.isPrimary) || acc.contacts?.[0] || null
    return {
      id: acc.id,
      zohoId: acc.zohoId,
      name: acc.name,
      tags: acc.tags,
      status: acc.status,
      quality: acc.quality,
      lastCalledAt: acc.lastCalledAt,
      lastPurchaseAt: acc.lastPurchaseAt,
      ownerId: acc.ownerId,
      industry: acc.industry,
      owner: acc.owner,
      totalSales,
      contacts: primaryContact ? [primaryContact] : [],
    }
  })

  const prunedStr = JSON.stringify(pruned)
  console.log('Pruned response size:', prunedStr.length, 'bytes', `(${(prunedStr.length/1024/1024).toFixed(2)} MB)`)
}

main().catch(console.error).finally(() => p.$disconnect())
