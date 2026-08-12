const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const invCount = await p.invoice.count({ where: { status: { notIn: ['Void', 'Draft'] } } })
  console.log('Invoices:', invCount)
  
  const payoutCount = await p.payout.count()
  console.log('Payouts:', payoutCount)
  
  const users = await p.user.findMany({ select: { id: true, name: true } })
  console.log('Users:', JSON.stringify(users))

  // Check a sample invoice for salesperson
  const inv = await p.invoice.findFirst({ select: { id: true, status: true, items: true }, where: { status: { notIn: ['Void', 'Draft'] } } })
  if (inv) {
    const items = inv.items || {}
    console.log('Sample inv salesperson:', items.salesperson || items.salesperson_name || 'NONE')
  }
}

main().catch(e => console.error(e.message)).finally(() => p.$disconnect())
