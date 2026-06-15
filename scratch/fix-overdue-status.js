require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth')
const p = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID

async function run() {
  const overdueInvoices = await p.invoice.findMany({
    where: { status: 'Overdue' },
    select: { id: true, zohoId: true, status: true, amount: true, items: true }
  })
  
  console.log(`Found ${overdueInvoices.length} invoices marked as Overdue. Fetching fresh statuses from Zoho Books...`)
  
  let token
  try {
    token = await getZohoAccessToken()
  } catch(e) {
    console.error("Failed to get token", e)
    process.exit(1)
  }

  let fixedCount = 0
  
  for (const inv of overdueInvoices) {
    try {
      const isBooksId = inv.zohoId && inv.zohoId.startsWith('1') && inv.zohoId.length > 15
      const targetId = isBooksId ? inv.zohoId : (inv.items?.booksInvoiceId || inv.zohoId)
      
      const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${targetId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      
      if (!res.ok) continue
      
      const data = await res.json()
      if (data.code === 0 && data.invoice) {
        let realStatus = data.invoice.status
        if (realStatus === 'void') realStatus = 'Void'
        if (realStatus === 'draft') realStatus = 'Draft'
        if (realStatus === 'writeoff' || realStatus === 'write_off' || realStatus === 'write off' || realStatus === 'bad debt') realStatus = 'Writeoff'
        if (realStatus === 'paid') realStatus = 'Paid'
        
        if (realStatus !== 'Overdue' && realStatus !== 'sent' && realStatus !== 'overdue') {
          console.log(`Fixing Invoice ${data.invoice.invoice_number}: Overdue -> ${realStatus}`)
          await p.invoice.update({
            where: { id: inv.id },
            data: { status: realStatus }
          })
          fixedCount++
        }
      }
    } catch(e) {
      // skip
    }
  }
  
  console.log(`Fixed ${fixedCount} invoices in the DB!`)
  process.exit(0)
}
run()
