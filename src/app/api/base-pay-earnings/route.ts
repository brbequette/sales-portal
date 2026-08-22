import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const url = new URL(req.url)
    const repId = url.searchParams.get("repId")
    const planId = url.searchParams.get("planId")
    const status = url.searchParams.get("status")

    const where: any = {}
    if (repId) where.repId = repId
    if (planId) where.planId = planId
    if (status) where.status = status

    const earnings = await prisma.basePayEarning.findMany({
      where,
      include: {
        rep: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, payType: true, baseAmount: true, baseInterval: true } },
      },
      orderBy: { periodStart: "desc" },
    })

    return NextResponse.json({ success: true, data: earnings })
  } catch (error: any) {
    console.error("GET base-pay-earnings error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { repId, planId, type, amount, periodStart, periodEnd, hoursWorked, hourlyRate, description, status } = body

    if (!repId || !type || amount == null || !periodStart || !periodEnd) {
      return NextResponse.json({ success: false, error: "repId, type, amount, periodStart, periodEnd required" }, { status: 400 })
    }

    const earning = await prisma.basePayEarning.create({
      data: {
        repId,
        planId: planId || null,
        type,
        amount: parseFloat(amount),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        hoursWorked: hoursWorked != null ? parseFloat(hoursWorked) : null,
        hourlyRate: hourlyRate != null ? parseFloat(hourlyRate) : null,
        description: description || null,
        status: status || "PENDING",
      },
      include: {
        rep: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, payType: true } },
      },
    })

    return NextResponse.json({ success: true, data: earning })
  } catch (error: any) {
    console.error("POST base-pay-earnings error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    const data: any = { ...updates }
    if (data.amount != null) data.amount = parseFloat(data.amount)
    if (data.hoursWorked != null) data.hoursWorked = parseFloat(data.hoursWorked)
    if (data.hourlyRate != null) data.hourlyRate = parseFloat(data.hourlyRate)
    if (data.periodStart) data.periodStart = new Date(data.periodStart)
    if (data.periodEnd) data.periodEnd = new Date(data.periodEnd)
    if (data.paidDate) data.paidDate = new Date(data.paidDate)

    const earning = await prisma.basePayEarning.update({
      where: { id },
      data,
      include: {
        rep: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, payType: true } },
      },
    })

    return NextResponse.json({ success: true, data: earning })
  } catch (error: any) {
    console.error("PUT base-pay-earnings error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
