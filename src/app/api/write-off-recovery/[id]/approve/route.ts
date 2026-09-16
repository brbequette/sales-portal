import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { applyLedgerEvent, assertApprovalAuthority, calculateWriteOffRecovery, type RecoveryComponent, type ReturnInspection } from "@/lib/write-off-recovery"

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  const { id } = await context.params
  try {
    const body = await request.json() as { dryRunHash: string; approvalIdempotencyKey: string; reason: string }
    if (!body.approvalIdempotencyKey || !body.reason?.trim()) throw new Error("Approval idempotency key and reason are required")
    const result = await prisma.$transaction(async tx => {
      const recoveryCase = await tx.writeOffRecoveryCase.findUnique({
        where: { id }, include: { components: true, returnInspections: true, invoice: true },
      })
      if (!recoveryCase) throw new Error("Recovery case not found")
      if (recoveryCase.status !== "PENDING_APPROVAL") throw new Error("Only pending cases may be approved")
      assertApprovalAuthority({ role: session.user.role, actorId: session.user.id, creatorId: recoveryCase.createdById, submittedById: recoveryCase.submittedById, responsibleRepId: recoveryCase.responsibleRepId })
      const components: RecoveryComponent[] = recoveryCase.components.map(c => ({ ...c, direction: c.direction as "COST" | "RECOVERY" }))
      const inspections: ReturnInspection[] = recoveryCase.returnInspections.map(i => ({ ...i, status: i.status as ReturnInspection["status"] }))
      const dryRun = calculateWriteOffRecovery({ responsibilityRateBps: recoveryCase.responsibilityRateBps, previouslyPaidCommissionCents: recoveryCase.commissionReversalCents, components, inspections })
      if (dryRun.dryRunHash !== body.dryRunHash || dryRun.dryRunHash !== recoveryCase.dryRunHash) throw new Error("Dry run is stale; rerun before approval")
      const duplicate = await tx.writeOffRecoveryLedgerEvent.findUnique({ where: { idempotencyKey: body.approvalIdempotencyKey } })
      if (duplicate) return { recoveryCase, idempotent: true }
      const now = new Date()
      const events = []
      let balance = 0
      const paidCommission = recoveryCase.commissionReversalCents
      if (paidCommission > 0) {
        const after = applyLedgerEvent(balance, "DEBIT", paidCommission)
        events.push({ caseId: id, repId: recoveryCase.responsibleRepId, version: recoveryCase.version, eventType: "COMMISSION_REVERSAL", direction: "DEBIT", amountCents: paidCommission, balanceBeforeCents: balance, balanceAfterCents: after, idempotencyKey: `${body.approvalIdempotencyKey}:commission`, sourceType: "MANAGER_APPROVAL", actorId: session.user.id, subjectUserId: recoveryCase.responsibleRepId, reason: body.reason.trim(), postedAt: now })
        balance = after
      }
      const after = applyLedgerEvent(balance, "DEBIT", dryRun.responsibilityChargeCents)
      events.push({ caseId: id, repId: recoveryCase.responsibleRepId, version: recoveryCase.version, eventType: "COST_RESPONSIBILITY_DEBIT", direction: "DEBIT", amountCents: dryRun.responsibilityChargeCents, balanceBeforeCents: balance, balanceAfterCents: after, idempotencyKey: body.approvalIdempotencyKey, sourceType: "MANAGER_APPROVAL", actorId: session.user.id, subjectUserId: recoveryCase.responsibleRepId, reason: body.reason.trim(), postedAt: now })
      await tx.writeOffRecoveryLedgerEvent.createMany({ data: events })
      await tx.invoice.update({ where: { id: recoveryCase.invoiceId }, data: { status: "written_off", isWrittenOff: true, writtenOffAt: now, writtenOffCostDeduction: dryRun.responsibilityChargeCents / 100 } })
      const updated = await tx.writeOffRecoveryCase.update({ where: { id }, data: { status: "APPROVED", approvedById: session.user.id, approvedAt: now, responsibilityChargeCents: dryRun.responsibilityChargeCents, remainingBalanceCents: dryRun.responsibilityChargeCents } })
      return { recoveryCase: updated, idempotent: false }
    }, { isolationLevel: "Serializable" })
    return NextResponse.json(result, { headers: noStore })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval failed"
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : message.includes("required") || message.includes("stale") || message.includes("pending") ? 400 : 403, headers: noStore })
  }
}
