import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const zohoId = searchParams.get('zohoId')

    if (!zohoId) {
      return NextResponse.json({ success: false, error: 'Missing zohoId' }, { status: 400 })
    }

    // Since a sale (zohoId) might not have explicit comms linked yet, 
    // we'll try to find the account for this sale, or just return calls linked by salesOrderId.
    // Let's assume some CallLogs have salesOrderId = zohoId.
    const calls = await prisma.callLog.findMany({
      where: { salesOrderId: zohoId },
      orderBy: { createdAt: 'desc' }
    })

    // Formatting for unified timeline
    const formattedCalls = calls.map(c => ({
      ...c,
      type: 'CALL' as const
    }))

    // For SMS, we'd need to link them to the sale too. If they don't have a saleId, we might not show them here.
    // For now, we return just the calls linked to this sale.
    const communications = [...formattedCalls].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return NextResponse.json({ success: true, communications })
  } catch (error: any) {
    console.error('Failed to fetch communications:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
