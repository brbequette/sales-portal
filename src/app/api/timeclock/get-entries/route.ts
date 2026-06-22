import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get("userId")
    const month = url.searchParams.get("month") // Optional: YYYY-MM

    if (!userId) {
      return NextResponse.json({ success: false, error: "Missing userId" }, { status: 400 })
    }

    const where: any = { userId }
    if (month) {
      where.date = { startsWith: month }
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        changeRequests: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    const now = new Date()
    const processedEntries = entries.map((entry: any) => {
      const isInactive = now.getTime() - new Date(entry.lastActivity).getTime() > 10 * 60000;
      const active = !isInactive && !entry.manualClockOut;

      let effectiveClockOut = entry.clockOut;
      if (isInactive && !entry.manualClockOut && !effectiveClockOut) {
        effectiveClockOut = new Date(new Date(entry.lastActivity).getTime() + 10 * 60000);
        // Fire and forget update
        prisma.timeEntry.update({
          where: { id: entry.id },
          data: { clockOut: effectiveClockOut }
        }).catch(console.error)
      }

      return {
        ...entry,
        active,
        clockOut: effectiveClockOut
      }
    })

    return NextResponse.json({ success: true, entries: processedEntries })
  } catch (error: any) {
    console.error("Error fetching time entries:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
