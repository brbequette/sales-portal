import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

/**
 * Calculate base pay for a rep for a given weekly period.
 * 
 * POST body: { repId, weekStart (YYYY-MM-DD) }
 * 
 * - HOURLY: Queries TimeEntry for the week, sums net hours, multiplies by plan rate
 * - SALARY: Plan baseAmount converted to weekly equivalent
 * - DRAW: Fixed weekly draw amount from plan
 * - COMMISSION_ONLY: Returns $0 base (commission handled separately)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { repId, weekStart } = body

    if (!repId || !weekStart) {
      return NextResponse.json({ success: false, error: "repId and weekStart required" }, { status: 400 })
    }

    // Get active compensation plan
    const plan = await prisma.compensationPlan.findFirst({
      where: { repId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    })

    if (!plan) {
      return NextResponse.json({ success: false, error: "No active compensation plan for this rep" }, { status: 404 })
    }

    const periodStart = new Date(weekStart)
    periodStart.setHours(0, 0, 0, 0)
    const periodEnd = new Date(periodStart)
    periodEnd.setDate(periodStart.getDate() + 6)
    periodEnd.setHours(23, 59, 59, 999)

    // Check if earning already exists for this period
    const existing = await prisma.basePayEarning.findFirst({
      where: {
        repId,
        periodStart: { gte: periodStart, lte: periodEnd },
        type: { in: ["SALARY", "DRAW", "HOURLY"] },
      },
    })

    if (existing) {
      return NextResponse.json({
        success: false,
        error: "Base pay already calculated for this period",
        existing,
      }, { status: 409 })
    }

    let amount = 0
    let hoursWorked: number | null = null
    let hourlyRate: number | null = null
    let description = ""

    switch (plan.payType) {
      case "HOURLY": {
        // Pull hours from TimeEntry
        hourlyRate = plan.baseAmount || 0
        const dateStr = periodStart.toISOString().split("T")[0]
        const endDateStr = periodEnd.toISOString().split("T")[0]

        const entries = await prisma.timeEntry.findMany({
          where: {
            userId: repId,
            date: { gte: dateStr, lte: endDateStr },
            clockOut: { not: null },
          },
        })

        let totalMs = 0
        for (const entry of entries) {
          if (entry.clockOut) {
            const clockIn = entry.manualClockIn || entry.clockIn
            const clockOut = entry.manualClockOut || entry.clockOut
            let ms = clockOut.getTime() - clockIn.getTime()

            // Subtract inactivity periods
            const inactivity = entry.inactivityPeriods as any[]
            if (Array.isArray(inactivity)) {
              for (const period of inactivity) {
                if (period.start && period.end) {
                  ms -= new Date(period.end).getTime() - new Date(period.start).getTime()
                }
              }
            }
            totalMs += Math.max(0, ms)
          }
        }

        hoursWorked = Math.round((totalMs / 3600000) * 100) / 100 // Round to 2 decimals
        amount = Math.round(hoursWorked * hourlyRate * 100) / 100
        description = `${hoursWorked} hrs × $${hourlyRate}/hr`
        break
      }

      case "SALARY": {
        // Convert to weekly based on interval
        const base = plan.baseAmount || 0
        switch (plan.baseInterval) {
          case "ANNUALLY": amount = Math.round((base / 52) * 100) / 100; break
          case "MONTHLY": amount = Math.round((base / 4.33) * 100) / 100; break
          case "BIWEEKLY": amount = Math.round((base / 2) * 100) / 100; break
          case "WEEKLY": amount = base; break
          case "DAILY": amount = base * 5; break // 5 working days
          case "HOURLY": amount = base * 40; break // 40hr week
          default: amount = base; break
        }
        description = `Salary: $${plan.baseAmount}/${(plan.baseInterval || "WEEKLY").toLowerCase()}`
        break
      }

      case "DRAW": {
        const base = plan.baseAmount || 0
        const cap = plan.drawCapPerPeriod
        switch (plan.baseInterval) {
          case "ANNUALLY": amount = Math.round((base / 52) * 100) / 100; break
          case "MONTHLY": amount = Math.round((base / 4.33) * 100) / 100; break
          case "BIWEEKLY": amount = Math.round((base / 2) * 100) / 100; break
          case "WEEKLY": amount = base; break
          case "DAILY": amount = base * 5; break
          default: amount = base; break
        }
        if (cap && amount > cap) amount = cap
        description = `Draw: $${amount.toFixed(2)}/week${plan.drawRecoverable ? " (recoverable)" : ""}`
        break
      }

      case "COMMISSION_ONLY":
        amount = 0
        description = "Commission only — no base pay"
        break
    }

    // Create the earning record
    const earning = await prisma.basePayEarning.create({
      data: {
        repId,
        planId: plan.id,
        type: plan.payType,
        amount,
        periodStart,
        periodEnd,
        hoursWorked,
        hourlyRate,
        description,
        status: "PENDING",
      },
      include: {
        rep: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, payType: true, drawRecoverable: true } },
      },
    })

    return NextResponse.json({ success: true, data: earning })
  } catch (error: any) {
    console.error("POST calculate-base-pay error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
