import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Recalculates all auto-clockout entries: sets clockOut = lastActivity (not +20min)
// Only affects entries where clockOut was auto-set (no manualClockOut) and clockOut > lastActivity
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun !== false // Default to dry run

    // Find all entries that have a clockOut but no manualClockOut
    // These are auto-clocked-out entries that may have the +20min inflation
    const entries = await prisma.timeEntry.findMany({
      where: {
        clockOut: { not: null },
        manualClockOut: null
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { date: 'desc' }
    })

    let fixed = 0
    let skipped = 0
    const details: any[] = []

    for (const entry of entries) {
      const clockOut = new Date(entry.clockOut!).getTime()
      const lastActivity = new Date(entry.lastActivity).getTime()
      const diffMinutes = (clockOut - lastActivity) / 60000

      // If clockOut is between 1-25 minutes after lastActivity, it was likely auto-inflated
      if (diffMinutes > 1 && diffMinutes <= 25) {
        if (!dryRun) {
          await prisma.timeEntry.update({
            where: { id: entry.id },
            data: { clockOut: entry.lastActivity }
          })
        }
        
        const oldHours = (clockOut - new Date(entry.clockIn).getTime()) / 3600000
        const newHours = (lastActivity - new Date(entry.clockIn).getTime()) / 3600000
        
        details.push({
          id: entry.id,
          user: entry.user?.name || entry.user?.email,
          date: entry.date,
          oldClockOut: entry.clockOut,
          newClockOut: entry.lastActivity,
          diffMinutes: Math.round(diffMinutes),
          oldHoursRaw: oldHours.toFixed(2),
          newHoursRaw: newHours.toFixed(2),
          status: dryRun ? 'would_fix' : 'fixed'
        })
        fixed++
      } else {
        skipped++
      }
    }

    const totalMinutesSaved = details.reduce((sum: number, d: any) => sum + d.diffMinutes, 0)

    return NextResponse.json({
      success: true,
      dryRun,
      totalEntries: entries.length,
      fixed,
      skipped,
      totalMinutesSaved,
      totalHoursSaved: (totalMinutesSaved / 60).toFixed(2),
      details: details.slice(0, 100) // Cap output
    })
  } catch (error: any) {
    console.error("Recalculate timeclock error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
