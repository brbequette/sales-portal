import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const url = new URL(req.url)
    const advanceId = url.searchParams.get("advanceId")
    const status = url.searchParams.get("status")

    const where: any = {}
    if (advanceId) where.advanceId = advanceId
    if (status) where.status = status

    const requests = await prisma.advanceExtensionRequest.findMany({
      where,
      include: {
        advance: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: requests })
  } catch (error: any) {
    console.error("GET advance-extensions error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { advanceId, requestedBy, additionalWeeks, reason } = body

    if (!advanceId || !requestedBy || !additionalWeeks || !reason) {
      return NextResponse.json({ success: false, error: "advanceId, requestedBy, additionalWeeks, reason required" }, { status: 400 })
    }

    const request = await prisma.advanceExtensionRequest.create({
      data: {
        advanceId,
        requestedBy,
        additionalWeeks: parseInt(additionalWeeks),
        reason,
        status: "PENDING",
      },
      include: {
        advance: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json({ success: true, data: request })
  } catch (error: any) {
    console.error("POST advance-extensions error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { id, status, reviewedBy, notes } = body

    if (!id || !status) {
      return NextResponse.json({ success: false, error: "id and status required" }, { status: 400 })
    }

    const request = await prisma.advanceExtensionRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: reviewedBy || null,
        reviewedAt: new Date(),
        notes: notes || null,
      },
      include: {
        advance: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })

    // If approved, extend the advance terms
    if (status === "APPROVED") {
      const advance = await prisma.advance.findUnique({ where: { id: request.advanceId } })
      if (advance) {
        const newTermWeeks = (advance.termWeeks || advance.splitOverWeeks || 0) + request.additionalWeeks
        const newEndDate = advance.termEndDate
          ? new Date(advance.termEndDate.getTime() + request.additionalWeeks * 7 * 24 * 60 * 60 * 1000)
          : null
        const newDeductionRate = advance.amount > 0 && newTermWeeks > 0
          ? Math.round(((advance.amount - advance.amountPaidBack) / newTermWeeks) * 100) / 100
          : advance.deductionRate

        await prisma.advance.update({
          where: { id: request.advanceId },
          data: {
            termWeeks: newTermWeeks,
            termEndDate: newEndDate,
            splitOverWeeks: newTermWeeks,
            deductionRate: newDeductionRate,
            agreedPayback: newDeductionRate,
          },
        })
      }
    }

    return NextResponse.json({ success: true, data: request })
  } catch (error: any) {
    console.error("PUT advance-extensions error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
