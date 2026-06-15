const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const overdueInvoices = await p.invoice.findMany({
    where: { status: 'Overdue' }
  })
  
  console.log(`Found ${overdueInvoices.length} invoices marked as Overdue in DB. Checking Zoho API to see if they are actually Void, Draft, or Write-off...`)
  
  // To avoid hitting the Zoho API limit quickly, we'll just log this for now, but
  // since there are only 111, we could check them using CustomModule5001.
  
  process.exit(0)
}
run()
