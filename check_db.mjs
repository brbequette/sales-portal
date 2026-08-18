import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const now = new Date()
const start = new Date(now.getFullYear(), now.getMonth(), 1)
const end = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59)

const [users, invoices, salesOrders, soByStatus] = await Promise.all([
  p.user.findMany({ select: { id: true, name: true }, where: {
    AND: [
      { NOT: { email: { contains: 'dummy.titandiamond.com' } } },
      { NOT: { email: { contains: 'example.com' } } }
    ]
  }}),
  p.invoice.findMany({
    where: { issueDate: { gte: start, lte: end } },
    select: { id: true, amount: true, status: true, issueDate: true, items: true }
  }),
  p.salesOrder.findMany({
    where: { orderDate: { gte: start, lte: end } },
    select: { id: true, amount: true, status: true, orderDate: true, items: true }
  }),
  p.salesOrder.groupBy({ by: ['status'], _count: { status: true } })
])

console.log('\nUser names in DB:')
users.forEach(u => console.log(' ', u.name))

console.log('\nThis month invoices:')
invoices.forEach(inv => {
  const items = (inv.items || {})
  console.log(`  status="${inv.status}" salesperson="${items.salesperson}" amount=${inv.amount}`)
})

console.log('\nThis month sales orders:')
salesOrders.forEach(so => {
  const items = (so.items || {})
  console.log(`  status="${so.status}" salesperson="${items.salesperson}" amount=${so.amount}`)
})

console.log('\nAll SO statuses in DB:')
soByStatus.forEach(s => console.log(`  "${s.status}": ${s._count.status}`))

await p.$disconnect()
