import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const actor = await getAuthenticatedDbUser()
    if (!actor) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })

    const url = new URL(req.url)
    const month = url.searchParams.get("month")
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ success: false, error: "Invalid month" }, { status: 400 })
    }

    const where: any = { userId: actor.user.id }
    if (month) where.date = { startsWith: month }

    const entries = await prisma.timeEntry.findMany({
      where,
      take: 200,
      orderBy: { date: 'desc' },
      include: {
        changeRequests: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    const processedEntries = entries.map(entry => {
      let inactivityPeriods = []
      try {
        if (entry.inactivityPeriods) {
          inactivityPeriods = typeof entry.inactivityPeriods === "string" 
            ? JSON.parse(entry.inactivityPeriods) 
            : (Array.isArray(entry.inactivityPeriods) ? entry.inactivityPeriods : [])
        }
      } catch (e) {}

      const effectiveOut = entry.manualClockOut || entry.clockOut
      const active = !effectiveOut

      return {
        ...entry,
        active,
        clockOut: effectiveOut,
        inactivityPeriods
      }
    })

    return NextResponse.json({ success: true, entries: processedEntries })
  } catch (error: any) {
    console.error("Error fetching time entries:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
