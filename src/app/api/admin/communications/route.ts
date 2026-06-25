import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(req: Request) {
  try {
    // Basic auth check: we will trust the client to pass the Zoho user context or role query param
    // since the Zoho Embedded App handles actual verification.
    // In a real strict setup, we'd verify a signed JWT from Zoho, but here we mirror other endpoints.
    const url = new URL(req.url)
    const role = url.searchParams.get("role") || ""

    if (!role.toUpperCase().includes("ADMIN") && !role.toUpperCase().includes("MANAGER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const [callLogs, smsLogs] = await Promise.all([
      prisma.callLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          account: { select: { name: true } },
          author: { select: { name: true, email: true } }
        }
      }),
      prisma.smsMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          account: { select: { name: true } },
          author: { select: { name: true, email: true } }
        }
      })
    ])

    return NextResponse.json({ success: true, callLogs, smsLogs })
  } catch (err: any) {
    console.error("Communications API Error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
