import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { rawText, filename } = await req.json()

    if (!rawText || typeof rawText !== "string") {
      return NextResponse.json({ success: false, error: "Missing vendor invoice text content" }, { status: 400 })
    }

    // 1. Extract Freight Cost (matches $XXX.XX or TOTAL: $XXX)
    const costMatches = rawText.match(/\$?\s*([0-9]{1,5}\.[0-9]{2})/g) || []
    const numbers = costMatches.map(m => parseFloat(m.replace(/[^0-9.]/g, ""))).filter(n => n > 0)
    const extrapolatedCost = numbers.length > 0 ? Math.max(...numbers) : 0

    // 2. Extract Tracking / Reference Number (matches 1Z..., PO-..., SO-..., or 10-digit numbers)
    const trackingMatch = rawText.match(/1Z[0-9A-Z]{16}|PRO\s*#?\s*[0-9A-Z]{6,15}|TRACKING\s*#?\s*:?\s*([0-9A-Z]+)/i)
    const trackingNumber = trackingMatch ? trackingMatch[0] : null

    // 3. Extract PO or Invoice Reference
    const refMatch = rawText.match(/PO\s*#?\s*:?\s*([0-9]{4,8})|INV\s*#?\s*:?\s*([0-9]{4,8})|ORDER\s*#?\s*:?\s*([0-9]{4,8})/i)
    const refNumber = refMatch ? (refMatch[1] || refMatch[2] || refMatch[3]) : null

    // Search for matching invoice in database
    let matchedInvoice: any = null
    if (refNumber || trackingNumber) {
      matchedInvoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { zohoId: refNumber || undefined },
            { items: { path: ['invoiceNumber'], equals: refNumber || '' } },
            { items: { path: ['salesOrderNumber'], equals: refNumber || '' } },
            { items: { path: ['reference_number'], equals: refNumber || '' } }
          ]
        }
      })
    }

    return NextResponse.json({
      success: true,
      extrapolatedData: {
        cost: extrapolatedCost,
        trackingNumber,
        referenceNumber: refNumber,
        filename,
      },
      matchedInvoice: matchedInvoice ? {
        id: matchedInvoice.id,
        zohoId: matchedInvoice.zohoId,
        invoiceNumber: (matchedInvoice.items as any)?.invoiceNumber || matchedInvoice.zohoId,
        customerName: (matchedInvoice.items as any)?.customer_name || "Customer",
        amount: matchedInvoice.amount,
        lineItems: (matchedInvoice.items as any)?.line_items || []
      } : null
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
