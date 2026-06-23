import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, action } = body // action is 'clockIn' or 'clockOut'

    if (!userId || !action) {
      return NextResponse.json({ success: false, error: "Missing userId or action" }, { status: 400 })
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "Unknown"

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

    const existing = await prisma.timeEntry.findUnique({
      where: {
        userId_date: { userId, date: phoenixDate }
      }
    })

    if (!existing) {
      // If no entry exists yet, ping must run first, or we create one
      const entry = await prisma.timeEntry.create({
        data: {
          userId,
          date: phoenixDate,
          clockIn: now,
          lastActivity: now,
          clockOut: null,
          manualClockOut: action === 'clockOut' ? now : null,
          ipAddress
        }
      })
      return NextResponse.json({ success: true, entry })
    }

    // Toggle
    const entry = await prisma.timeEntry.update({
      where: { id: existing.id },
      data: {
        manualClockOut: action === 'clockOut' ? now : null,
        ipAddress: ipAddress !== "Unknown" ? ipAddress : existing.ipAddress
      }
    })

    return NextResponse.json({ success: true, entry })
  } catch (error: any) {
    console.error("Error toggling timeclock:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
