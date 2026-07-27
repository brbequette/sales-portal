import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get("userId")
    const email = url.searchParams.get("email")
    const month = url.searchParams.get("month")

    if (!userId && !email) {
      return NextResponse.json({ success: false, error: "Missing userId or email" }, { status: 400 })
    }

    const userConditions: any[] = []
    if (userId) userConditions.push({ userId })
    if (email) {
      userConditions.push({ user: { email } })
      const dbUser = await prisma.user.findUnique({ where: { email } })
      if (dbUser) userConditions.push({ userId: dbUser.id })
    }

    const where: any = {}
    if (userConditions.length > 0) {
      where.OR = userConditions
    }
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
