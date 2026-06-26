require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth')
const p = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = '664670946'

async function run() {
  const overdueInvoices = await p.invoice.findMany({
    where: { status: 'Overdue' },
    select: { id: true, zohoId: true, status: true, amount: true, items: true }
  })
  
  console.log(`Found ${overdueInvoices.length} invoices marked as Overdue.`)
  
  let token = await getZohoAccessToken()
  let fixedCount = 0
  
  for (const inv of overdueInvoices) {
    let targetId = inv.zohoId;
    if (inv.items && typeof inv.items === 'object' && inv.items.booksInvoiceId) {
      targetId = inv.items.booksInvoiceId;
    } else if (inv.zohoId && inv.zohoId.startsWith('1')) {
      targetId = inv.zohoId;
    }
    
    // Helper for throttling
    const delay = (ms) => new Promise(res => setTimeout(res, ms))
    
    // Test the targetId
    console.log(`Inv ${inv.id}: targetId=${targetId}`)
    try {
      const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${targetId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      if (!res.ok) {
        console.log(`API failed for ${targetId}: ${res.status}`)
        continue
      }
      
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
    } catch(e) { }
    
    await delay(300);
  }
  
  console.log(`Fixed ${fixedCount} invoices in the DB!`)
  process.exit(0)
}
run()
