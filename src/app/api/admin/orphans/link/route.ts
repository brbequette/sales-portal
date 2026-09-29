import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { type, id, invoiceNumber } = await req.json()

    if (!type || !id || !invoiceNumber) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const cleanInput = String(invoiceNumber).trim()
    const cleanDigits = cleanInput.replace(/\D/g, "")

    // 1. Try finding Invoice
    let invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { zohoId: cleanInput },
          { invoiceNumber: cleanInput },
          { salesorderNumber: cleanInput },
          { items: { path: ['invoiceNumber'], equals: cleanInput } },
          { items: { path: ['salesorder_number'], equals: cleanInput } },
          { items: { path: ['reference_number'], equals: cleanInput } }
        ]
      }
    })

    // 2. Try finding Sales Order if no direct Invoice
    let salesOrder = null
    if (!invoice) {
      salesOrder = await prisma.salesOrder.findFirst({
        where: {
          OR: [
            { zohoId: cleanInput },
            { items: { path: ['salesorder_number'], equals: cleanInput } },
            { items: { path: ['reference_number'], equals: cleanInput } }
          ]
        }
      })
      if (salesOrder) {
        // Try linking to Invoice linked with this Sales Order
        invoice = await prisma.invoice.findFirst({
          where: {
            OR: [
              { salesOrderZohoId: salesOrder.zohoId },
              { salesorderNumber: String(cleanInput) }
            ]
          }
        })
      }
    }

    // 3. Try finding Quote / Estimate
    let quote = null
    if (!invoice && !salesOrder) {
      quote = await prisma.quote.findFirst({
        where: {
          OR: [
            { zohoId: cleanInput },
            { items: { path: ['quote_number'], equals: cleanInput } },
            { items: { path: ['estimate_number'], equals: cleanInput } }
          ]
        }
      })
      if (quote) {
        invoice = await prisma.invoice.findFirst({
          where: { estimateZohoId: quote.zohoId }
        })
      }
    }

    if (!invoice && !salesOrder && !quote) {
      return NextResponse.json({ success: false, error: `Document '${cleanInput}' not found` }, { status: 404 })
    }

    const resolvedInvoiceId = invoice ? invoice.zohoId : (salesOrder ? salesOrder.zohoId : quote!.zohoId)
    const itemsData: any = (invoice?.items || salesOrder?.items || quote?.items) || {}
    const finalDocNumber = invoice?.invoiceNumber || itemsData.invoiceNumber || itemsData.salesorder_number || itemsData.estimate_number || cleanInput

    if (type === 'po') {
      await prisma.purchaseOrder.update({
        where: { zohoId: id },
        data: {
          invoiceId: resolvedInvoiceId,
          invoiceNumber: String(finalDocNumber),
          salesOrderId: salesOrder ? salesOrder.zohoId : undefined,
          salesOrderNumber: salesOrder ? String(finalDocNumber) : undefined
        }
      })
    } else if (type === 'payment') {
      await prisma.payment.update({
        where: { zohoId: id },
        data: {
          invoiceId: resolvedInvoiceId,
          invoiceNumber: String(finalDocNumber)
        }
      })
    } else {
      return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: `Successfully linked ${type} to sales document ${finalDocNumber}` })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

