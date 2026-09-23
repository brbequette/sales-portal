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
const previousMonthKey = (key: string) => {
  const [year, month] = key.split("-").map(Number)
  const prior = new Date(Date.UTC(year, month - 2, 1))
  return monthKey(prior)
}
const storedNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[$,%]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

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
  const goalByMonth = new Map(goals.map(goal => [goal.monthKey, goal]))
  const rates = new Map(goals.map(goal => [goal.monthKey, goal.manualVigRate ?? goal.lastSyncedVigRate]))
  const actuals = new Map<string, { subtotal: number; deadProfit: number }>()
  for (const invoice of invoices) {
    const mk = monthKey(invoice.issueDate)
    const items = invoice.items && typeof invoice.items === "object" && !Array.isArray(invoice.items) ? invoice.items as Record<string, any> : {}
    const current = actuals.get(mk) || { subtotal: 0, deadProfit: 0 }
    current.subtotal += storedNumber(items.sub_total ?? items.subTotal ?? invoice.amount)
    current.deadProfit += storedNumber(items.deadProfitActual)
    actuals.set(mk, current)
  }
  const rateSource = new Map<string, string>()
  for (const mk of [...new Set(invoices.map(invoice => monthKey(invoice.issueDate)))].sort()) {
    if (ross.constantVigEnabled && ross.constantVigValue != null) {
      rates.set(mk, ross.constantVigValue)
      rateSource.set(mk, "CONSTANT_REP_OVERRIDE")
      continue
    }
    if (rates.get(mk) != null) {
      const goal = goalByMonth.get(mk)
      rateSource.set(mk, goal?.manualVigRate != null ? "MONTHLY_MANUAL_RATE" : "MONTHLY_SYNCED_RATE")
      continue
    }
    const priorKey = previousMonthKey(mk)
    const priorGoal = goalByMonth.get(priorKey)
    const priorActual = actuals.get(priorKey)
    if (!priorGoal || !priorActual) continue
    const met = String(priorGoal.metric || "PROFIT").toUpperCase() === "SUBTOTAL"
      ? priorActual.subtotal >= priorGoal.subtotalGoal
      : priorActual.deadProfit >= priorGoal.profitGoal
    rates.set(mk, met ? 1.3 : 1.5)
    rateSource.set(mk, `PRIOR_GOAL_${met ? "MET" : "MISSED"}:${priorKey}`)
  }
  const byMonth: Record<string, { invoices: number; updates: number; blocked: number; rate: number | null; rateSource: string | null; commissionBefore: number; commissionAfter: number }> = {}
  const updates: Array<{ id: string; data: any }> = []
  const exceptions: any[] = []
  const calculationSamples: any[] = []

  for (const invoice of invoices) {
    const mk = monthKey(invoice.issueDate)
    const rate = rates.get(mk)
    byMonth[mk] ||= { invoices: 0, updates: 0, blocked: 0, rate: rate ?? null, rateSource: rateSource.get(mk) || null, commissionBefore: 0, commissionAfter: 0 }
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
    if (calculationSamples.length < 30) calculationSamples.push({
      invoiceNumber: invoice.invoiceNumber, monthKey: mk, status: invoice.status, rate,
      inputs: { subtotal: items.sub_total ?? items.subTotal ?? invoice.amount, subjectToVig: items.deadCostSubjectToVig, noVig: items.deadCostNoVig, additionalCosts: items.additionalCosts, ccFees: items.ccFees },
      before: { profit: items.profit, commission: items.commission ?? items.salesCommission, deadCostPlusVig: items.deadCostPlusVig },
      after: { profit: calc.profit, commission: calc.commission, deadCostPlusVig: calc.deadCostPlusVig },
    })
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
  return { ross: { id: ross.id, name: ross.name, payoutStructure: ross.payoutStructure }, invoiceCount: invoices.length, updateCount: updates.length, blockedCount: exceptions.length, byMonth, calculationSamples, exceptions: exceptions.slice(0, 100), applied: apply && exceptions.length === 0, zohoCalls: 0 }
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
