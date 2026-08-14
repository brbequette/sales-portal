import { NextResponse } from "next/server"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function POST() {
  try {
    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: 'Overdue' },
      select: { id: true, zohoId: true, status: true, amount: true, items: true }
    })
    
    const token = await getZohoAccessToken()
    if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 500 })

    let fixedCount = 0
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms))
    
    for (const inv of overdueInvoices) {
      let targetId = inv.zohoId
      const items: any = inv.items || {}
      if (items.booksInvoiceId) {
        targetId = items.booksInvoiceId
      } else if (inv.zohoId && inv.zohoId.startsWith('1')) {
        targetId = inv.zohoId
      }
      
      try {
        const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${targetId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
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
            await prisma.invoice.update({
              where: { id: inv.id },
              data: { status: realStatus }
            })
            fixedCount++
          }
        }
      } catch(e) { }
      
      await delay(300)
    }
    
    return NextResponse.json({ message: `Fixed ${fixedCount} overdue invoices in DB.` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
