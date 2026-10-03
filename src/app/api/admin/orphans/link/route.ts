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

    if (type === 'po') {
      return NextResponse.json({ success: false, requiresReview: true,
        error: 'PO links require fresh corroborated provider evidence and the audited reconciliation workflow. A suggestion or document number alone cannot authorize a link.' }, { status: 409 })
    }

    const cleanInput = String(invoiceNumber).trim()
    const cleanDigits = cleanInput.replace(/\D/g, "")
    const searchKeys = Array.from(new Set([
      cleanInput,
      cleanDigits,
      `SO #${cleanDigits}`,
      `SO#${cleanDigits}`,
      `SO-${cleanDigits}`,
      `INV-${cleanDigits}`,
      `INV #${cleanDigits}`,
      cleanInput.replace(/^#/, ""),
      cleanInput.replace(/^SO\s*#?/i, "").trim()
    ])).filter(k => k && k.length >= 2)

    // 1. Try finding Invoice
    let invoice = await prisma.invoice.findFirst({
      where: {
        OR: searchKeys.flatMap(k => [
          { zohoId: k },
          { invoiceNumber: k },
          { computedInvoiceNumber: k },
          { salesorderNumber: k },
          { items: { path: ['invoiceNumber'], equals: k } },
          { items: { path: ['invoice_number'], equals: k } },
          { items: { path: ['salesorder_number'], equals: k } },
          { items: { path: ['reference_number'], equals: k } }
        ])
      }
    })

    // 2. Try finding Sales Order if no direct Invoice
    let salesOrder = null
    if (!invoice) {
      salesOrder = await prisma.salesOrder.findFirst({
        where: {
          OR: searchKeys.flatMap(k => [
            { zohoId: k },
            { items: { path: ['salesorder_number'], equals: k } },
            { items: { path: ['reference_number'], equals: k } }
          ])
        }
      })
      if (salesOrder) {
        // Try linking to Invoice linked with this Sales Order
        invoice = await prisma.invoice.findFirst({
          where: {
            OR: [
              { salesOrderZohoId: salesOrder.zohoId },
              ...searchKeys.map(k => ({ salesorderNumber: k }))
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
          OR: searchKeys.flatMap(k => [
            { zohoId: k },
            { items: { path: ['quote_number'], equals: k } },
            { items: { path: ['estimate_number'], equals: k } },
            { items: { path: ['reference_number'], equals: k } }
          ])
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
    const finalDocNumber = invoice?.invoiceNumber || invoice?.computedInvoiceNumber || itemsData.invoiceNumber || itemsData.salesorder_number || itemsData.estimate_number || cleanDigits || cleanInput

    if (type === 'payment') {
      await prisma.payment.updateMany({
        where: {
          OR: [{ zohoId: id }, { id }]
        },
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

