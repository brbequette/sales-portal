const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const r = await p.$queryRawUnsafe('SELECT status, COUNT(*) as cnt FROM "Invoice" GROUP BY status ORDER BY cnt DESC')
  console.log('Status distribution:')
  r.forEach(row => console.log(`  ${row.status}: ${row.cnt}`))

  const total = await p.invoice.count()
  console.log('\nTotal invoices:', total)

  const notPaid = await p.invoice.count({ where: { status: { notIn: ['Paid', 'Void', 'Voided', 'Draft'] } } })
  console.log('Not paid/void/draft:', notPaid)

  const overdue = await p.invoice.count({ where: { status: 'Overdue' } })
  console.log('Explicit Overdue status:', overdue)

  const pastDue = await p.invoice.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ['Paid', 'Void', 'Voided', 'Draft'] } } })
  console.log('Past due + not paid:', pastDue)

  const noDueDate = await p.invoice.count({ where: { dueDate: null } })
  console.log('No due date:', noDueDate)

  process.exit(0)
}
run()
