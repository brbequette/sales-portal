import { PrismaClient } from '@prisma/client'
import { getZohoAccessToken } from '../netlify/functions/lib/zoho-auth'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BASE_URL = `https://www.zohoapis.${ZOHO_DC}/books/v3`

async function run() {
  console.log("Locating the uncached document...")

  // Check Invoices
  const invs = await prisma.invoice.findMany({
    where: {
      items: { path: ['booksInvoiceId'], not: '' },
      OR: [
        { items: { path: ['line_items'], equals: null as any } },
        { items: { path: ['line_items'], equals: [] } }
      ]
    },
    select: { id: true, zohoId: true, amount: true, status: true, items: true }
  })

  // Check Sales Orders
  const sos = await prisma.salesOrder.findMany({
    where: {
      items: { path: ['booksSalesOrderId'], not: '' },
      OR: [
        { items: { path: ['line_items'], equals: null as any } },
        { items: { path: ['line_items'], equals: [] } }
      ]
    },
    select: { id: true, zohoId: true, amount: true, status: true, items: true }
  })

  // Check Quotes
  const quotes = await prisma.quote.findMany({
    where: {
      items: { path: ['booksEstimateId'], not: '' },
      status: { equals: 'Invoiced' },
      OR: [
        { items: { path: ['line_items'], equals: null as any } },
        { items: { path: ['line_items'], equals: [] } }
      ]
    },
    select: { id: true, zohoId: true, amount: true, status: true, items: true }
  })

  const results: any[] = []
  invs.forEach(r => results.push({ id: r.id, zohoId: r.zohoId || (r.items as any)?.booksInvoiceId, type: 'Invoice', docNum: (r.items as any)?.invoiceNumber }))
  sos.forEach(r => results.push({ id: r.id, zohoId: r.zohoId || (r.items as any)?.booksSalesOrderId, type: 'SalesOrder', docNum: (r.items as any)?.salesOrderNumber }))
  quotes.forEach(r => results.push({ id: r.id, zohoId: r.zohoId || (r.items as any)?.booksEstimateId, type: 'Quote', docNum: (r.items as any)?.estimateNumber }))

  if (results.length === 0) {
    console.log("No uncached documents found in the local database!")
    return
  }

  console.log(`Found ${results.length} uncached documents:`)
  console.log(JSON.stringify(results, null, 2))

  const token = await getZohoAccessToken()
  const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

  for (const doc of results) {
    const modPath = doc.type === 'Invoice' ? 'invoices' : doc.type === 'SalesOrder' ? 'salesorders' : 'estimates'
    const url = `${BASE_URL}/${modPath}/${doc.zohoId}?organization_id=${ORG_ID}`
    console.log(`\nTesting Zoho API fetch for ${doc.type} (${doc.docNum || 'No Number'}) with ID ${doc.zohoId}...`)
    console.log(`URL: ${url}`)
    
    try {
      const res = await fetch(url, { headers: authHeaders })
      console.log(`Response Status: ${res.status}`)
      const data: any = await res.json()
      console.log("Response Body:")
      console.log(JSON.stringify(data, null, 2))
    } catch (e: any) {
      console.error("Fetch failed:", e.message)
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
