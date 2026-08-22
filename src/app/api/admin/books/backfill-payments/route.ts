import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"
const ORG_ID = ZOHO_ORGANIZATION_ID

const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function POST() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const token = await getZohoAccessToken()
    if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 500 })

    let page = 1
    let hasMore = true
    let totalUpdated = 0

    while (hasMore) {
      const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&status=paid&per_page=200&page=${page}`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const data = await res.json()
      
      if (data.code !== 0 || !data.invoices || data.invoices.length === 0) break

      const updateOps = []
      for (const booksInv of data.invoices) {
        const localInvoice = await prisma.invoice.findFirst({
          where: {
            OR: [
              { items: { path: ['booksInvoiceId'], equals: booksInv.invoice_id } },
              { zohoId: String(booksInv.invoice_id) }
            ]
          }
        })
        
        if (localInvoice) {
          const currentItems: any = localInvoice.items || {}
          const currentPaymentDate = currentItems.paymentDate
          let paymentDate = booksInv.last_payment_date || booksInv.date
          
          if (currentPaymentDate !== paymentDate || localInvoice.status !== 'Paid') {
            currentItems.paymentDate = paymentDate
            currentItems.balance = 0
            
            updateOps.push(
              prisma.invoice.update({
                where: { id: localInvoice.id },
                data: { status: 'Paid', items: currentItems }
              })
            )
          }
        }
      }
      
      if (updateOps.length > 0) {
        await prisma.$transaction(updateOps)
        totalUpdated += updateOps.length
      }
      
      hasMore = data.page_context?.has_more_page || false
      page++
      await new Promise(res => setTimeout(res, 500))
    }
    
    return NextResponse.json({ message: `Backfilled ${totalUpdated} paid invoices.` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
