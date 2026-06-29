import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, email, name } = body

    if (!userId && !email) {
      return NextResponse.json({ success: false, error: "Missing userId or email" }, { status: 400 })
    }

    let finalUserId = userId
    if (email) {
      let dbUser = await prisma.user.findUnique({ where: { email } })
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: { email, name: name || "Zoho User", role: "AGENT", password: "" }
        })
      }
      finalUserId = dbUser.id
    }

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

    const clockOutTime = new Date(now.getTime() + 10 * 60000)

    // Upsert TimeEntry for this user and date
    // If it exists, only update lastActivity. If not, create it.
    const existing = await prisma.timeEntry.findUnique({
      where: {
        userId_date: { userId: finalUserId, date: phoenixDate }
      }
    })

    let entry;
    if (existing) {
      let newInactivityPeriods = existing.inactivityPeriods ? JSON.parse(existing.inactivityPeriods as string || "[]") : []
      if (!Array.isArray(newInactivityPeriods)) newInactivityPeriods = []

      const timeSinceLastActivity = now.getTime() - new Date(existing.lastActivity).getTime()
      if (timeSinceLastActivity >= 30 * 60000) {
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
          inactivityPeriods: JSON.stringify(newInactivityPeriods),
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

    return NextResponse.json({ success: true, entry })
  } catch (error: any) {
    console.error("Error in timeclock ping:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
