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

    const { invoiceId, returnedAmount, returnedCost } = await req.json()
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { OR: [{ id: invoiceId }, { zohoId: invoiceId }] }
    })

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const retCost = parseFloat(returnedCost || 0)
    const retAmount = parseFloat(returnedAmount || 0)
    const repHold = retCost * 0.5

    // Reduce invoice items balance and record returned cost hold
    const items = invoice.items as any || {}
    const currentBalance = parseFloat(items.balance || invoice.amount || 0)
    const newBalance = Math.max(0, currentBalance - retAmount)

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        returnedItemsCost: (invoice.returnedItemsCost || 0) + retCost,
        returnedItemsRepHold: (invoice.returnedItemsRepHold || 0) + repHold,
        returnedItemsResold: false,
        items: {
          ...items,
          balance: newBalance,
          amountOwedReduced: (items.amountOwedReduced || 0) + retAmount
        }
      }
    })

    return NextResponse.json({
      success: true,
      invoice: updatedInvoice,
      repHold,
      newBalance,
      message: `Re-inventory logged. Amount owed reduced by $${retAmount.toFixed(2)}. Rep 50% hold set to $${repHold.toFixed(2)}.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
