const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['Paid', 'paid', 'Closed', 'closed', 'Fulfilled', 'fulfilled'] }
    }
  })

  const weeklyTotals = {}
  for (const inv of invoices) {
    const items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || {})
    const date = items.paymentDate || inv.issueDate
    if (date) {
      const d = new Date(date)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const weekStart = new Date(d)
      weekStart.setDate(diff)
      weekStart.setHours(0, 0, 0, 0)
      const startStr = weekStart.toISOString().split('T')[0]
      
      if (startStr >= '2026-06-08') {
        weeklyTotals[startStr] = (weeklyTotals[startStr] || 0) + inv.amount
      }
    }
  }

  console.log("Weekly Totals >= 2026-06-08:", weeklyTotals)
}

main().finally(() => prisma.$disconnect())
