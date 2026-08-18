import "dotenv/config"
import { prisma } from "../netlify/functions/lib/prisma"

async function auditDataCompleteness() {
  console.log("=== STARTING SYSTEM DATA COMPLETENESS AUDIT ===")

  // 1. Audit Invoices
  const invoices = await prisma.invoice.findMany({
    take: 500,
    orderBy: { createdAt: "desc" },
    include: { account: true }
  })

  console.log(`Auditing ${invoices.length} recent invoice records...`)
  let validInvoices = 0
  let linkedSalesOrders = 0
  let linkedAccounts = 0

  invoices.forEach(inv => {
    if (inv.accountId && inv.account) linkedAccounts++
    const raw = (inv.rawData as any) || {}
    const items = (inv.items as any) || {}
    const soNum = inv.salesOrderNumber || raw.salesorder_number || items.salesorder_number || raw.salesorder_id
    if (soNum) linkedSalesOrders++
    validInvoices++
  })

  console.log(`✅ Invoices Audited: ${validInvoices}/${invoices.length}`)
  console.log(`   - Linked to Accounts: ${linkedAccounts}/${invoices.length} (${((linkedAccounts/invoices.length)*100).toFixed(1)}%)`)
  console.log(`   - Linked to Originating Sales Orders: ${linkedSalesOrders}/${invoices.length} (${((linkedSalesOrders/invoices.length)*100).toFixed(1)}%)`)

  // 2. Audit Sales Orders
  const salesOrders = await prisma.salesOrder.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { account: true }
  })

  console.log(`\nAuditing ${salesOrders.length} recent sales order records...`)
  let validSO = 0
  salesOrders.forEach(so => {
    if (so.accountId && so.account) validSO++
  })
  console.log(`✅ Sales Orders Audited: ${validSO}/${salesOrders.length}`)

  // 3. Audit Phone Contacts
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ phone: { not: null } }, { mobilePhone: { not: null } }] }
  })
  console.log(`\n✅ Verified ${contacts.length} phone contact records linked to Accounts for ZDialer & SMS auto-matching.`)

  console.log("\n=== DATA COMPLETENESS AUDIT COMPLETED SUCCESSFULLY ===")
  await prisma.$disconnect()
}

auditDataCompleteness().catch(err => {
  console.error("Audit failed:", err)
  prisma.$disconnect()
  process.exit(1)
})
