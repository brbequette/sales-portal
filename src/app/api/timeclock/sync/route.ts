import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const sessionUser = session.user as typeof session.user & { dbId?: string }
    const dbUser = sessionUser.dbId
      ? await prisma.user.findUnique({ where: { id: sessionUser.dbId } })
      : await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!dbUser) return NextResponse.json({ error: "Signed-in user is not linked to a local account" }, { status: 403 })
    const finalUserId = dbUser.id

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "Unknown"

    // Get current Phoenix time date string (YYYY-MM-DD)
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(now)
    const ye = parts.find(p => p.type === 'year')?.value
    const mo = parts.find(p => p.type === 'month')?.value
    const da = parts.find(p => p.type === 'day')?.value
    const phoenixDate = `${ye}-${mo}-${da}`



    // Upsert TimeEntry for this user and date
    // If it exists, only update lastActivity. If not, create it.
    const existing = await prisma.timeEntry.findUnique({
      where: {
        userId_date: { userId: finalUserId, date: phoenixDate }
      }
    })

    let entry;
    if (existing) {
      let newInactivityPeriods = []
      try {
        if (typeof existing.inactivityPeriods === 'string') {
          newInactivityPeriods = JSON.parse(existing.inactivityPeriods)
        } else if (Array.isArray(existing.inactivityPeriods)) {
          newInactivityPeriods = existing.inactivityPeriods
        }
      } catch (e) { console.warn('Failed to parse inactivityPeriods:', e) }
      if (!Array.isArray(newInactivityPeriods)) newInactivityPeriods = []

      const timeSinceLastActivity = now.getTime() - new Date(existing.lastActivity).getTime()
      if (timeSinceLastActivity >= 20 * 60000) {
        newInactivityPeriods.push({
          id: Math.random().toString(36).substring(2, 9),
          start: existing.lastActivity.toISOString(),
          end: now.toISOString(),
          durationMinutes: Math.round(timeSinceLastActivity / 60000)
        })
      }

      entry = await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          lastActivity: now,
          inactivityPeriods: newInactivityPeriods,
          // Only clear clockOut if they haven't explicitly manually clocked out
          ...(existing.manualClockOut ? {} : { clockOut: null }),
          ipAddress: ipAddress !== "Unknown" ? ipAddress : existing.ipAddress
        }
      })
    } else {
      entry = await prisma.timeEntry.create({
        data: {
          userId: finalUserId,
          date: phoenixDate,
          clockIn: now,
          lastActivity: now,
          clockOut: null,
          ipAddress
        }
      })
    }

    // Determine active status: active if last activity is within 20 minutes and no manual clock out
    const isActive = !entry.manualClockOut && (now.getTime() - new Date(entry.lastActivity).getTime() < 20 * 60000)
    return NextResponse.json({ success: true, entry, active: isActive })
  } catch (error: any) {
    console.error("Error in timeclock ping:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
