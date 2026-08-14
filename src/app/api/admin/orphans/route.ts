import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const [orphanedPOs, orphanedPayments] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          invoiceId: null,
          isInventoryOrder: false,
        },
        orderBy: { date: 'desc' }
      }),
      prisma.payment.findMany({
        where: {
          invoiceId: null,
        },
        orderBy: { date: 'desc' }
      })
    ])

    return NextResponse.json({
      success: true,
      purchaseOrders: orphanedPOs,
      payments: orphanedPayments,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
