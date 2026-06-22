import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ success: false, error: "Missing userId" }, { status: 400 })
    }

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
    const entry = await prisma.timeEntry.upsert({
      where: {
        userId_date: {
          userId,
          date: phoenixDate
        }
      },
      update: {
        lastActivity: now
      },
      create: {
        userId,
        date: phoenixDate,
        clockIn: now,
        lastActivity: now
      }
    })

    return NextResponse.json({ success: true, entry })
  } catch (error: any) {
    console.error("Error in timeclock ping:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
