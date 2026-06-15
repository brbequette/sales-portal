const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const overdueInvoices = await p.invoice.findMany({
    where: { status: 'Overdue' },
    select: { id: true, zohoId: true, status: true, invoiceNumber: true }
  })
  
  console.log(`Found ${overdueInvoices.length} invoices marked as Overdue in DB. Need to verify their actual status in Zoho CRM.`)
  
  // We can just fetch them from the CRM API
  // Using the get-accounts logic, we would normally sync.
  
  process.exit(0)
}
run()
