import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const role = url.searchParams.get("role") || ""

    if (!role.toUpperCase().includes("ADMIN") && !role.toUpperCase().includes("MANAGER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const [callLogs, smsLogs] = await Promise.all([
      prisma.callLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          account: { select: { id: true, name: true, zohoId: true } },
          author: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.smsMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          account: { select: { id: true, name: true, zohoId: true } },
          author: { select: { id: true, name: true, email: true } }
        }
      })
    ])

    const unifiedLogs = [
      ...callLogs.map(call => ({
        id: call.id,
        type: 'CALL',
        timestamp: call.createdAt,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        duration: call.duration,
        status: call.status,
        content: call.notes || null,
        account: call.account,
        author: call.author,
      })),
      ...smsLogs.map(sms => ({
        id: sms.id,
        type: 'SMS',
        timestamp: sms.createdAt,
        direction: sms.direction,
        fromNumber: sms.fromNumber,
        toNumber: sms.toNumber,
        duration: null,
        status: 'completed', // SMS doesn't have status usually
        content: sms.body || null,
        account: sms.account,
        author: sms.author,
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ success: true, unifiedLogs })
  } catch (err: any) {
    console.error("Communications API Error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
