import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

const START = new Date("2025-01-01T00:00:00.000Z")
const END = new Date("2027-01-01T00:00:00.000Z")

function finite(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rawCommissionRate(items: Record<string, any>): number | null {
  const fields = Array.isArray(items.custom_fields) ? items.custom_fields : []
  const field = fields.find((entry: any) => {
    const label = String(entry?.label || entry?.api_name || "").toUpperCase()
    return label.includes("COMMISSION FROM PROFIT") || label.includes("COMMISION FROM PROFIT")
  })
  return finite(field?.value)
}

function summarize(
  rows: Array<Record<string, any>>,
  dateKey: "issueDate" | "orderDate",
  kind: "invoice" | "salesOrder",
) {
  const result = {
    total: rows.length,
    byYear: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    rawCommission40: 0,
    rawCommission50: 0,
    calculatedCommission40: 0,
    calculatedCommission50: 0,
    missingProfit: 0,
    missingCommission: 0,
    missingVig: 0,
    commissionMismatch: 0,
    fallbackCost: 0,
  }

  for (const row of rows) {
    const year = String(new Date(row[dateKey]).getUTCFullYear())
    const status = String(row.status || "unknown").toLowerCase()
    result.byYear[year] = (result.byYear[year] || 0) + 1
    result.byStatus[status] = (result.byStatus[status] || 0) + 1
    const items = row.items && typeof row.items === "object" ? row.items : {}
    const rawRate = rawCommissionRate(items)
    const calculatedRate = finite(items.commissionPercent ?? items.commissionPct)
    if (rawRate === 40) result.rawCommission40++
    if (rawRate === 50) result.rawCommission50++
    if (calculatedRate === 40) result.calculatedCommission40++
    if (calculatedRate === 50) result.calculatedCommission50++
    const profit = finite(kind === "invoice" ? row.computedProfit ?? items.profit : items.profit)
    const commission = finite(items.commission)
    const vig = finite(kind === "invoice" ? row.computedVigRate ?? items.vigRate : items.vigRate)
    if (profit == null) result.missingProfit++
    if (commission == null) result.missingCommission++
    if (vig == null) result.missingVig++
    if (items.usedFallbackCost === true) result.fallbackCost++
    if (profit != null && commission != null && Math.abs(commission - profit * 0.5) > 0.011 && rawRate === 40) {
      result.commissionMismatch++
    }
  }
  return result
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  const [invoices, salesOrders] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: START, lt: END } },
      select: { zohoId: true, invoiceNumber: true, issueDate: true, status: true, items: true, computedProfit: true, computedVigRate: true },
    }),
    prisma.salesOrder.findMany({
      where: { orderDate: { gte: START, lt: END } },
      select: { zohoId: true, orderDate: true, status: true, items: true },
    }),
  ])

  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    range: { start: START.toISOString(), endExclusive: END.toISOString() },
    invoices: summarize(invoices as Array<Record<string, any>>, "issueDate", "invoice"),
    salesOrders: summarize(salesOrders as Array<Record<string, any>>, "orderDate", "salesOrder"),
    exceptions: {
      invoicesWithRawCommission40: (invoices as Array<Record<string, any>>)
        .filter(row => rawCommissionRate((row.items && typeof row.items === "object" ? row.items : {}) as Record<string, any>) === 40)
        .map(row => ({ zohoId: row.zohoId, invoiceNumber: row.invoiceNumber, status: row.status, issueDate: row.issueDate })),
      salesOrdersMissingFinancials: (salesOrders as Array<Record<string, any>>)
        .filter(row => {
          const items = row.items && typeof row.items === "object" ? row.items : {}
          return finite(items.profit) == null || finite(items.commission) == null || finite(items.vigRate) == null
        })
        .map(row => ({ zohoId: row.zohoId, status: row.status, orderDate: row.orderDate })),
    },
  })
}
