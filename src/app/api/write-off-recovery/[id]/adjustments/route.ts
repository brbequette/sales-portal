import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { applyLedgerEvent, calculateResponsibilityShare, isRecoveryManagerRole } from "@/lib/write-off-recovery"

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  if (!isRecoveryManagerRole(session.user.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403, headers: noStore })
  const { id } = await context.params
  try {
    const body = await request.json() as {
      eventType: "RETURN_CREDIT" | "REFUND_CREDIT" | "WAIVER_CREDIT" | "ADJUSTMENT"
      amountCents?: number; idempotencyKey: string; sourceType: string; sourceId?: string; reason: string
      inspection?: { status: "ACCEPTED_RESELLABLE" | "DAMAGED" | "MISSING" | "UNSELLABLE"; historicalProductCostCents: number; acceptedProductCostCents: number; receivedAt: string; inspectedAt: string; notes?: string }
    }
    if (!body.idempotencyKey || !body.reason?.trim() || !body.sourceType) {
      throw new Error("Idempotency key, source, and reason are required")
    }
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.writeOffRecoveryLedgerEvent.findUnique({ where: { idempotencyKey: body.idempotencyKey } })
      if (existing) return { event: existing, idempotent: true }
      const recoveryCase = await tx.writeOffRecoveryCase.findUnique({ where: { id } })
      if (!recoveryCase) throw new Error("Recovery case not found")
      if (recoveryCase.status !== "APPROVED" && recoveryCase.status !== "WAIVED") throw new Error("Only approved cases may be adjusted")
      if (recoveryCase.responsibleRepId === session.user.id) throw new Error("Responsible salesperson cannot approve an adjustment")
      let amountCents = body.amountCents
      let recoveredCompanyCostCents = 0
      if (body.eventType === "RETURN_CREDIT") {
        const inspection = body.inspection
        if (!inspection || inspection.status !== "ACCEPTED_RESELLABLE" || !inspection.inspectedAt) throw new Error("Return credit requires an inspected, accepted resellable return")
        if (!Number.isSafeInteger(inspection.historicalProductCostCents) || !Number.isSafeInteger(inspection.acceptedProductCostCents)
          || inspection.historicalProductCostCents < 0 || inspection.acceptedProductCostCents < 0
          || inspection.acceptedProductCostCents > inspection.historicalProductCostCents) throw new Error("Return costs must be valid integer cents")
        amountCents = calculateResponsibilityShare(inspection.acceptedProductCostCents, recoveryCase.responsibilityRateBps)
        recoveredCompanyCostCents = inspection.acceptedProductCostCents
        await tx.writeOffReturnInspection.create({ data: {
          caseId: id, version: recoveryCase.version + 1, idempotencyKey: `${body.idempotencyKey}:inspection`,
          sourceType: body.sourceType, sourceId: body.sourceId, status: inspection.status,
          historicalProductCostCents: inspection.historicalProductCostCents, acceptedProductCostCents: inspection.acceptedProductCostCents,
          receivedAt: new Date(inspection.receivedAt), inspectedAt: new Date(inspection.inspectedAt), inspectedById: session.user.id,
          actorId: session.user.id, subjectUserId: recoveryCase.responsibleRepId, notes: inspection.notes,
        } })
      }
      if (!Number.isSafeInteger(amountCents) || (amountCents as number) < 0) throw new Error("Adjustment amount must be integer cents")
      if (body.eventType === "REFUND_CREDIT") {
        recoveredCompanyCostCents = amountCents as number
        amountCents = calculateResponsibilityShare(recoveredCompanyCostCents, recoveryCase.responsibilityRateBps)
      }
      const direction = body.eventType === "ADJUSTMENT" ? "DEBIT" : "CREDIT"
      const after = applyLedgerEvent(recoveryCase.remainingBalanceCents, direction, amountCents as number)
      const version = recoveryCase.version + 1
      const event = await tx.writeOffRecoveryLedgerEvent.create({ data: {
        caseId: id, repId: recoveryCase.responsibleRepId, version, eventType: body.eventType,
        direction, amountCents: amountCents as number, balanceBeforeCents: recoveryCase.remainingBalanceCents,
        balanceAfterCents: after, idempotencyKey: body.idempotencyKey, sourceType: body.sourceType,
        sourceId: body.sourceId, actorId: session.user.id, subjectUserId: recoveryCase.responsibleRepId, reason: body.reason.trim(),
      } })
      const status = body.eventType === "WAIVER_CREDIT" && after === 0 ? "WAIVED" : recoveryCase.status
      await tx.writeOffRecoveryCase.update({ where: { id }, data: {
        version, status, remainingBalanceCents: after,
        recoveryCents: recoveryCase.recoveryCents + recoveredCompanyCostCents,
        creditCents: recoveryCase.creditCents + (direction === "CREDIT" ? amountCents as number : 0),
        waivedById: body.eventType === "WAIVER_CREDIT" ? session.user.id : recoveryCase.waivedById,
        waivedAt: body.eventType === "WAIVER_CREDIT" ? new Date() : recoveryCase.waivedAt,
        waiverReason: body.eventType === "WAIVER_CREDIT" ? body.reason.trim() : recoveryCase.waiverReason,
      } })
      return { event, idempotent: false }
    }, { isolationLevel: "Serializable" })
    return NextResponse.json(result, { headers: noStore })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adjustment failed"
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400, headers: noStore })
  }
}
