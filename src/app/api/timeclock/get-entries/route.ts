import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get("userId")
    const email = url.searchParams.get("email")
    const month = url.searchParams.get("month") // Optional: YYYY-MM

    if (!userId && !email) {
      return NextResponse.json({ success: false, error: "Missing userId or email" }, { status: 400 })
    }

    let finalUserId = userId
    if (email) {
      const dbUser = await prisma.user.findUnique({ where: { email } })
      if (dbUser) {
        finalUserId = dbUser.id
      }
    }

    const where: any = { userId: finalUserId }
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
      const isInactive = now.getTime() - new Date(entry.lastActivity).getTime() > 20 * 60000;
      const active = !isInactive && !entry.manualClockOut;

      let effectiveClockOut = entry.clockOut;
      if (isInactive && !entry.manualClockOut && !effectiveClockOut) {
        effectiveClockOut = new Date(new Date(entry.lastActivity).getTime() + 20 * 60000);
        // Fire and forget update
        prisma.timeEntry.update({
          where: { id: entry.id },
          data: { clockOut: effectiveClockOut }
        }).catch(console.error)
      }

      let inactivityPeriods = []
      try {
        if (entry.inactivityPeriods) {
           inactivityPeriods = typeof entry.inactivityPeriods === "string" ? JSON.parse(entry.inactivityPeriods) : entry.inactivityPeriods
        }
      } catch (e) {}

      return {
        ...entry,
        active,
        clockOut: effectiveClockOut,
        inactivityPeriods
      }
    })

    return NextResponse.json({ success: true, entries: processedEntries })
  } catch (error: any) {
    console.error("Error fetching time entries:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
