import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { invoiceId, reason } = await req.json()
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { OR: [{ id: invoiceId }, { zohoId: invoiceId }] }
    })

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const items = invoice.items as any || {}
    const orderCost = parseFloat(items.deadCostTotal || items.cost || items.totalCost || invoice.amount * 0.4 || 0)
    const repDeduction = orderCost * 0.5

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "written_off",
        isWrittenOff: true,
        writtenOffAt: new Date(),
        writtenOffCostDeduction: repDeduction
      }
    })

    return NextResponse.json({
      success: true,
      invoice: updatedInvoice,
      repDeduction,
      message: `Invoice ${invoice.id} marked as written off. Rep assigned 50% cost responsibility ($${repDeduction.toFixed(2)}).`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
