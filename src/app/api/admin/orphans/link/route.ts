import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { type, id, invoiceNumber } = await req.json()

    if (!type || !id || !invoiceNumber) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Verify invoice exists
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { zohoId: invoiceNumber },
          { items: { path: ['invoiceNumber'], equals: invoiceNumber } }
        ]
      }
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: `Invoice '${invoiceNumber}' not found` }, { status: 404 })
    }

    const invoiceId = invoice.zohoId
    const itemsData: any = invoice.items || {}
    const finalInvoiceNumber = itemsData.invoiceNumber || invoiceNumber

    if (type === 'po') {
      await prisma.purchaseOrder.update({
        where: { zohoId: id },
        data: {
          invoiceId,
          invoiceNumber: finalInvoiceNumber
        }
      })
    } else if (type === 'payment') {
      await prisma.payment.update({
        where: { zohoId: id },
        data: {
          invoiceId,
          invoiceNumber: finalInvoiceNumber
        }
      })
    } else {
      return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: `Successfully linked ${type} to invoice ${finalInvoiceNumber}` })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
