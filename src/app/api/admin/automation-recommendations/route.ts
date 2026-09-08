import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

const REVIEW_STATUSES = new Set(["APPROVED", "REJECTED", "PAUSED"])

export async function GET(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  const url = new URL(req.url)
  const status = url.searchParams.get("status") || "PROPOSED"
  const recommendations = await prisma.automationRecommendation.findMany({
    where: status === "ALL" ? {} : { status },
    include: {
      account: { select: { id: true, name: true, ownerId: true } },
      proposedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 250,
  })
  return NextResponse.json({ success: true, recommendations })
}

export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  if (!auth.session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await req.json()
  if (!body.title?.trim() || !body.rationale?.trim() || !body.triggerType?.trim()) {
    return NextResponse.json({ success: false, error: "Title, rationale and trigger type are required" }, { status: 400 })
  }
  const recommendation = await prisma.automationRecommendation.create({
    data: {
      accountId: body.accountId || null,
      proposedById: auth.session.user.dbId || auth.session.user.id || null,
      title: body.title.trim(),
      rationale: body.rationale.trim(),
      triggerType: body.triggerType.trim(),
      conditions: (body.conditions || {}) as Prisma.InputJsonValue,
      actions: (body.actions || []) as Prisma.InputJsonValue,
      evidence: body.evidence == null ? undefined : body.evidence as Prisma.InputJsonValue,
      simulation: body.simulation == null ? undefined : body.simulation as Prisma.InputJsonValue,
      mode: "DRAFT_ONLY",
    },
  })
  return NextResponse.json({ success: true, recommendation }, { status: 201 })
}

export async function PATCH(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  if (!auth.session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await req.json()
  if (!body.id || !REVIEW_STATUSES.has(body.status)) {
    return NextResponse.json({ success: false, error: "A valid recommendation id and review status are required" }, { status: 400 })
  }
  if (body.status === "REJECTED" && !body.rejectionReason?.trim()) {
    return NextResponse.json({ success: false, error: "A rejection reason is required" }, { status: 400 })
  }
  const recommendation = await prisma.automationRecommendation.update({
    where: { id: body.id },
    data: {
      status: body.status,
      reviewedById: auth.session.user.dbId || auth.session.user.id,
      reviewedAt: new Date(),
      rejectionReason: body.status === "REJECTED" ? body.rejectionReason.trim() : null,
      // Approval records intent only. A separate audited rule compiler is required
      // before any recommendation can execute customer-facing actions.
      mode: "DRAFT_ONLY",
    },
  })
  return NextResponse.json({ success: true, recommendation })
}
