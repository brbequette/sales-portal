import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { differs, reconcileStoredInvoiceFinancials } from "@/lib/commission-reconciliation"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const START = new Date("2025-01-01T00:00:00.000Z")
const END = new Date("2027-01-01T00:00:00.000Z")
const excluded = ["Void", "void", "Voided", "voided", "Draft", "draft", "Orphaned", "orphaned", "Deleted", "deleted"]
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

async function buildAudit(apply: boolean) {
  const ross = await prisma.user.findFirst({ where: { name: { equals: "ROSS HAISLER", mode: "insensitive" } } })
  if (!ross) throw new Error("Ross Haisler portal user was not found")
  const [invoices, goals] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issueDate: { gte: START, lt: END },
        computedSalesperson: { equals: "ROSS HAISLER", mode: "insensitive" },
        status: { notIn: excluded },
      },
      select: { id: true, zohoId: true, invoiceNumber: true, issueDate: true, amount: true, status: true, items: true },
      orderBy: { issueDate: "asc" },
    }),
    prisma.monthlyVigGoal.findMany({ where: { repId: ross.id }, orderBy: { monthKey: "asc" } }),
  ])
  const rates = new Map(goals.map(goal => [goal.monthKey, goal.manualVigRate ?? goal.lastSyncedVigRate]))
  const byMonth: Record<string, { invoices: number; updates: number; blocked: number; rate: number | null; commissionBefore: number; commissionAfter: number }> = {}
  const updates: Array<{ id: string; data: any }> = []
  const exceptions: any[] = []

  for (const invoice of invoices) {
    const mk = monthKey(invoice.issueDate)
    const rate = ross.constantVigEnabled && ross.constantVigValue != null ? ross.constantVigValue : rates.get(mk)
    byMonth[mk] ||= { invoices: 0, updates: 0, blocked: 0, rate: rate ?? null, commissionBefore: 0, commissionAfter: 0 }
    byMonth[mk].invoices++
    const items = invoice.items && typeof invoice.items === "object" && !Array.isArray(invoice.items) ? invoice.items as Record<string, any> : {}
    if (rate == null || !Number.isFinite(rate)) {
      byMonth[mk].blocked++
      exceptions.push({ invoiceNumber: invoice.invoiceNumber, zohoId: invoice.zohoId, monthKey: mk, reason: "MISSING_GOAL_VIG_RATE" })
      continue
    }
    const calc = reconcileStoredInvoiceFinancials(items, invoice.amount, rate)
    if (!calc) {
      byMonth[mk].blocked++
      exceptions.push({ invoiceNumber: invoice.invoiceNumber, zohoId: invoice.zohoId, monthKey: mk, reason: "MISSING_COST_BUCKETS" })
      continue
    }
    byMonth[mk].commissionBefore += Number(items.commission ?? items.salesCommission ?? 0)
    byMonth[mk].commissionAfter += calc.commission
    const changed = differs(items.vigRate ?? items.vig, calc.vigRate)
      || differs(items.profit, calc.profit)
      || differs(items.deadCostPlusVig, calc.deadCostPlusVig)
      || differs(items.deadCostTotal, calc.deadCostTotal)
      || differs(items.deadProfitActual, calc.deadProfitActual)
      || differs(items.commissionPercent, 50)
      || differs(items.commission ?? items.salesCommission, calc.commission)
    if (!changed) continue
    byMonth[mk].updates++
    updates.push({
      id: invoice.id,
      data: {
        items: {
          ...items,
          vigRate: calc.vigRate, vig: calc.vigRate, cf_salesperson_vig: calc.vigRate,
          deadCostSubjectToVig: calc.deadCostSubjectToVig, deadCostNoVig: calc.deadCostNoVig,
          deadCostTotal: calc.deadCostTotal, deadCostPlusVig: calc.deadCostPlusVig,
          profit: calc.profit, deadProfitActual: calc.deadProfitActual,
          commissionPercent: 50, commissionPct: 50,
          commission: calc.commission, salesCommission: calc.commission,
        },
        computedDeadCost: calc.deadCostTotal,
        computedProfit: calc.profit,
        computedDeadProfit: calc.deadProfitActual,
        computedVigRate: calc.vigRate,
        pendingCostSync: false,
        pendingZohoFetch: false,
        costsCalculatedAt: new Date(),
      },
    })
  }
  for (const summary of Object.values(byMonth)) {
    summary.commissionBefore = Math.round(summary.commissionBefore * 100) / 100
    summary.commissionAfter = Math.round(summary.commissionAfter * 100) / 100
  }
  if (apply && exceptions.length === 0) {
    for (let offset = 0; offset < updates.length; offset += 50) {
      await prisma.$transaction(updates.slice(offset, offset + 50).map(update => prisma.invoice.update({ where: { id: update.id }, data: update.data })))
    }
  }
  return { ross: { id: ross.id, name: ross.name, payoutStructure: ross.payoutStructure }, invoiceCount: invoices.length, updateCount: updates.length, blockedCount: exceptions.length, byMonth, exceptions: exceptions.slice(0, 100), applied: apply && exceptions.length === 0, zohoCalls: 0 }
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try { return NextResponse.json(await buildAudit(false)) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit failed" }, { status: 500 }) }
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json().catch(() => ({}))
  if (body.confirmation !== "APPLY ROSS PORTAL COMMISSION RECONCILIATION") return NextResponse.json({ error: "Confirmation required" }, { status: 400 })
  try {
    const preview = await buildAudit(false)
    if (preview.blockedCount) return NextResponse.json({ error: "Blocked invoices must be resolved before apply", ...preview }, { status: 409 })
    return NextResponse.json(await buildAudit(true))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed" }, { status: 500 }) }
}
