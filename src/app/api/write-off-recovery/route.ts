import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { calculateWriteOffRecovery, isRecoveryManagementViewer, isRecoveryManagerRole, type RecoveryComponent, type ReturnInspection } from "@/lib/write-off-recovery"
import { DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS } from "@/lib/write-off-recovery-shared"

export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }
const omitSensitive = <T extends object>(record: T, keys: string[]) => Object.fromEntries(
  Object.entries(record).filter(([key]) => !keys.includes(key)),
)

async function actor() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return { id: session.user.id, role: session.user.role || "" }
}

export async function GET() {
  const user = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  const management = isRecoveryManagementViewer(user.role)
  const cases = await prisma.writeOffRecoveryCase.findMany({
    where: management ? {} : { responsibleRepId: user.id },
    include: {
      invoice: { select: { invoiceNumber: true, zohoId: true, account: { select: { name: true } } } },
      responsibleRep: { select: { id: true, name: true } },
      components: { orderBy: { createdAt: "asc" } },
      returnInspections: { orderBy: { createdAt: "asc" } },
      ledgerEvents: { orderBy: { postedAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  })
  const data = management ? cases : cases.map(item => ({
    ...item,
    components: item.components.map(component => omitSensitive(component, ["evidence", "sourceId", "actorId"])),
    returnInspections: item.returnInspections.map(inspection => omitSensitive(inspection, ["sourceId", "actorId", "inspectedById"])),
    ledgerEvents: item.ledgerEvents.map(event => omitSensitive(event, ["sourceId", "actorId", "metadata"])),
  }))
  return NextResponse.json({ scope: management ? "management" : "personal", cases: data }, { headers: noStore })
}

export async function POST(request: Request) {
  const user = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  if (!isRecoveryManagerRole(user.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403, headers: noStore })
  try {
    const body = await request.json() as {
      mode?: "DRY_RUN" | "CREATE_DRAFT"; invoiceId: string; responsibleRepId: string; reason: string
      responsibilityRateBps?: number; responsibilityRateOverrideReason?: string; previouslyPaidCommissionCents?: number; components: RecoveryComponent[]; inspections?: Array<Omit<ReturnInspection, "receivedAt" | "inspectedAt"> & { receivedAt: string; inspectedAt?: string | null }>
    }
    const policy = await prisma.writeOffRecoveryPolicy.findUnique({ where: { id: "default" } })
    const responsibilityRateBps = body.responsibilityRateBps ?? policy?.responsibilityRateBps ?? DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS
    const originalResponsibilityRateBps = policy?.responsibilityRateBps ?? DEFAULT_WRITE_OFF_RESPONSIBILITY_RATE_BPS
    const overrideReason = body.responsibilityRateOverrideReason?.trim() || null
    if (responsibilityRateBps !== originalResponsibilityRateBps && (!overrideReason || overrideReason.length < 10)) {
      throw new Error("An authorized individual responsibility-rate override requires an audit reason of at least 10 characters")
    }
    const inspections: ReturnInspection[] = (body.inspections || []).map(item => ({
      ...item, receivedAt: new Date(item.receivedAt), inspectedAt: item.inspectedAt ? new Date(item.inspectedAt) : null,
    }))
    const dryRun = calculateWriteOffRecovery({ responsibilityRateBps, previouslyPaidCommissionCents: body.previouslyPaidCommissionCents, components: body.components || [], inspections })
    if (body.mode !== "CREATE_DRAFT") return NextResponse.json({ dryRun, persisted: false }, { headers: noStore })
    if (!body.invoiceId || !body.responsibleRepId || !body.reason?.trim()) throw new Error("Invoice, responsible salesperson, and reason are required")
    const invoice = await prisma.invoice.findFirst({ where: { OR: [{ id: body.invoiceId }, { zohoId: body.invoiceId }] }, select: { id: true } })
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404, headers: noStore })
    const recoveryCase = await prisma.writeOffRecoveryCase.create({
      data: {
        invoiceId: invoice.id, responsibleRepId: body.responsibleRepId, reason: body.reason.trim(), createdById: user.id,
        originalResponsibilityRateBps, responsibilityRateBps, responsibilityRateOverrideReason: overrideReason,
        originalCostCents: dryRun.originalCostCents, recoveryCents: dryRun.recoveryCents,
        responsibilityChargeCents: dryRun.responsibilityChargeCents, commissionReversalCents: dryRun.commissionReversalCents, remainingBalanceCents: dryRun.responsibilityChargeCents,
        dryRunHash: dryRun.dryRunHash, dryRunAt: new Date(), status: "PENDING_APPROVAL", submittedById: user.id, submittedAt: new Date(),
        components: { create: body.components.map(({ evidence, ...component }) => ({
          ...component, sourceId: component.sourceId || null,
          ...(evidence == null ? {} : { evidence: evidence as Prisma.InputJsonValue }), version: 1,
          actorId: user.id, subjectUserId: body.responsibleRepId, occurredAt: new Date(),
        })) },
        returnInspections: { create: inspections.map(inspection => ({
          ...inspection, version: 1, actorId: user.id, subjectUserId: body.responsibleRepId,
        })) },
      },
    })
    return NextResponse.json({ persisted: true, recoveryCase, dryRun }, { status: 201, headers: noStore })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid recovery request"
    const status = message.toLowerCase().includes("idempotency") ? 409 : 400
    return NextResponse.json({ error: message }, { status, headers: noStore })
  }
}
