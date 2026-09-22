/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function PATCH(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const body = await req.json(); const record = await prisma.phoneDeliverability.findUnique({ where: { id: String(body.id || "") } })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (["OPT_OUT_SUPPRESSED", "LEGAL_SUPPRESSED"].includes(record.suppressionStatus)) return NextResponse.json({ error: "Opt-out and legal restrictions cannot be overridden here" }, { status: 403 })
  const reason = String(body.reason || "").trim(); if (!reason) return NextResponse.json({ error: "Audit reason required" }, { status: 400 })
  const administratorId = (auth as any).user?.id || (auth as any).session?.user?.id || "administrator"
  const updated = await prisma.$transaction(async tx => {
    await tx.phoneDeliverabilityReview.create({ data: { phoneDeliverabilityId: record.id, administratorId, previousDeliverabilityStatus: record.deliverabilityStatus, nextDeliverabilityStatus: body.deliverabilityStatus, previousSuppressionStatus: record.suppressionStatus, nextSuppressionStatus: body.suppressionStatus, reason } })
    return tx.phoneDeliverability.update({ where: { id: record.id }, data: { deliverabilityStatus: body.deliverabilityStatus, suppressionStatus: body.suppressionStatus, automaticDecision: false, overrideAdministratorId: administratorId, overrideReason: reason, lastCheckedAt: new Date() } })
  })
  return NextResponse.json({ success: true, id: updated.id })
}

export async function POST(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const { id } = await req.json(); const record = await prisma.phoneDeliverability.findUnique({ where: { id: String(id || "") } })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: false, requiresManualReview: true, message: "No non-message Zoho carrier lookup is configured. No test or promotional message was sent." }, { status: 409 })
}
