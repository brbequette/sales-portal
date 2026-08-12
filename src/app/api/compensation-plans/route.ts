import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const repId = url.searchParams.get("repId")
    const status = url.searchParams.get("status")

    const where: any = {}
    if (repId) where.repId = repId
    if (status) where.status = status

    const plans = await prisma.compensationPlan.findMany({
      where,
      include: { rep: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: plans })
  } catch (error: any) {
    console.error("GET compensation-plans error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      repId, name, status, startDate, endDate,
      payType, baseAmount, baseInterval,
      commissionEnabled, commissionRate, commissionBasis, payoutStructure,
      drawRecoverable, drawCapPerPeriod,
      commitmentEnabled, commitmentMetric, commitmentTarget,
      commitmentVigRate, commitmentGoalType, commitmentPenalty,
      notes
    } = body

    if (!repId || !name || !startDate) {
      return NextResponse.json({ success: false, error: "repId, name, and startDate are required" }, { status: 400 })
    }

    // End any existing active plan for this rep
    await prisma.compensationPlan.updateMany({
      where: { repId, status: "ACTIVE" },
      data: { status: "ENDED", endDate: new Date() },
    })

    const plan = await prisma.compensationPlan.create({
      data: {
        repId,
        name,
        status: status || "ACTIVE",
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        payType: payType || "COMMISSION_ONLY",
        baseAmount: baseAmount != null ? parseFloat(baseAmount) : null,
        baseInterval: baseInterval || null,
        commissionEnabled: commissionEnabled !== false,
        commissionRate: commissionRate != null ? parseFloat(commissionRate) : null,
        commissionBasis: commissionBasis || null,
        payoutStructure: payoutStructure || "two_payment",
        drawRecoverable: drawRecoverable !== false,
        drawCapPerPeriod: drawCapPerPeriod != null ? parseFloat(drawCapPerPeriod) : null,
        commitmentEnabled: commitmentEnabled || false,
        commitmentMetric: commitmentMetric || null,
        commitmentTarget: commitmentTarget != null ? parseFloat(commitmentTarget) : null,
        commitmentVigRate: commitmentVigRate != null ? parseFloat(commitmentVigRate) : null,
        commitmentGoalType: commitmentGoalType || null,
        commitmentPenalty: commitmentPenalty || null,
        notes: notes || null,
      },
      include: { rep: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json({ success: true, data: plan })
  } catch (error: any) {
    console.error("POST compensation-plans error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    // Parse numeric fields
    const data: any = { ...updates }
    if (data.baseAmount != null) data.baseAmount = parseFloat(data.baseAmount)
    if (data.commissionRate != null) data.commissionRate = parseFloat(data.commissionRate)
    if (data.drawCapPerPeriod != null) data.drawCapPerPeriod = parseFloat(data.drawCapPerPeriod)
    if (data.commitmentTarget != null) data.commitmentTarget = parseFloat(data.commitmentTarget)
    if (data.commitmentVigRate != null) data.commitmentVigRate = parseFloat(data.commitmentVigRate)
    if (data.startDate) data.startDate = new Date(data.startDate)
    if (data.endDate) data.endDate = new Date(data.endDate)

    const plan = await prisma.compensationPlan.update({
      where: { id },
      data,
      include: { rep: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json({ success: true, data: plan })
  } catch (error: any) {
    console.error("PUT compensation-plans error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
    }

    await prisma.compensationPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("DELETE compensation-plans error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
