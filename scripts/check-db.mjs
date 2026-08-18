import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const [invCount, soCount, dealCount] = await Promise.all([
  p.invoice.count(),
  p.salesOrder.count(),
  p.deal.count(),
])

// Sample a few invoices to see items size
const samples = await p.invoice.findMany({
  take: 3,
  orderBy: { issueDate: 'desc' },
  select: { invoiceNumber: true, items: true }
})

const sizes = samples.map(s => ({
  inv: s.invoiceNumber,
  bytes: JSON.stringify(s.items || {}).length,
  hasSalesperson: !!(s.items?.salesperson),
  hasDeadCost: !!(s.items?.deadCostTotal),
  lineItemsCount: Array.isArray(s.items?.line_items) ? s.items.line_items.length : 'none',
}))

console.log(JSON.stringify({ invCount, soCount, dealCount, samples: sizes }, null, 2))
await p.$disconnect()
