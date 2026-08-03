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

    const { originalInvoiceId, newInvoiceId } = await req.json()
    if (!originalInvoiceId || !newInvoiceId) {
      return NextResponse.json({ error: "originalInvoiceId and newInvoiceId are required" }, { status: 400 })
    }

    const origInvoice = await prisma.invoice.findFirst({
      where: { OR: [{ id: originalInvoiceId }, { zohoId: originalInvoiceId }] }
    })

    if (!origInvoice) {
      return NextResponse.json({ error: "Original Invoice not found" }, { status: 404 })
    }

    // Clear hold on original invoice and set resold status
    const clearedHold = origInvoice.returnedItemsRepHold || 0
    const updatedOrig = await prisma.invoice.update({
      where: { id: origInvoice.id },
      data: {
        returnedItemsResold: true,
        resoldInvoiceId: newInvoiceId,
        returnedItemsRepHold: 0
      }
    })

    return NextResponse.json({
      success: true,
      originalInvoice: updatedOrig,
      clearedHold,
      message: `Returned blades resold on invoice ${newInvoiceId}. Rep hold of $${clearedHold.toFixed(2)} cleared.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
