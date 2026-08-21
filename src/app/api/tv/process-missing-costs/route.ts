import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { hasValidTvSession } from "@/lib/tv-auth"
import { prisma } from "@/lib/prisma"
import { processInvoiceCostsForSystem } from "../../../../../netlify/functions/process-invoice-costs"
import { getSystemSettings } from "../../../../../netlify/functions/lib/settings"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const activeInvoices = new Set<string>()

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const tvSession = session ? false : await hasValidTvSession()
  const role = String(session?.user?.role || "").toLowerCase()
  if (!tvSession && !role.includes("admin") && !role.includes("manager")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const settings = await getSystemSettings(prisma)
  if (settings.pause_mass_zoho_updates) {
    return NextResponse.json({ error: "Automatic Zoho cost updates are paused" }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const requestedIds: string[] = Array.isArray(body.invoiceIds)
    ? [...new Set<string>(body.invoiceIds.map((value: unknown) => String(value)).filter(Boolean))].slice(0, 5)
    : []
  if (requestedIds.length === 0) return NextResponse.json({ success: true, processed: 0 })

  // Only current-week invoices that still lack authoritative cost fields can
  // be repaired from the TV workflow.
  const now = new Date()
  const phoenixNow = new Date(now.getTime() - 7 * 60 * 60 * 1000)
  const day = phoenixNow.getUTCDay()
  const monday = new Date(Date.UTC(phoenixNow.getUTCFullYear(), phoenixNow.getUTCMonth(), phoenixNow.getUTCDate() + (day === 0 ? -6 : 1 - day), 7))
  const invoices = await prisma.invoice.findMany({
    where: { zohoId: { in: requestedIds }, issueDate: { gte: monday } },
    select: { zohoId: true, computedDeadCost: true, items: true },
  })

  const results: Array<{ invoiceId: string; success: boolean }> = []
  for (const invoice of invoices) {
    if (!invoice.zohoId || activeInvoices.has(invoice.zohoId)) continue
    const items = (invoice.items as Record<string, unknown>) || {}
    const storedDeadCost = Number(invoice.computedDeadCost ?? items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? 0)
    const alreadyProcessed = storedDeadCost > 0 || Boolean(items.costsCalculatedAt)
    if (alreadyProcessed) continue

    activeInvoices.add(invoice.zohoId)
    try {
      const response = await processInvoiceCostsForSystem(invoice.zohoId)
      const payload = JSON.parse(response?.body || "{}")
      results.push({ invoiceId: invoice.zohoId, success: response?.statusCode === 200 && payload.success === true })
    } catch {
      results.push({ invoiceId: invoice.zohoId, success: false })
    } finally {
      activeInvoices.delete(invoice.zohoId)
    }
  }

  return NextResponse.json({ success: results.every(result => result.success), processed: results.filter(result => result.success).length, results })
}
