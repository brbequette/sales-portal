import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { hasValidTvSession } from "@/lib/tv-auth"
import { prisma } from "@/lib/prisma"
import { processInvoiceCostsForSystem } from "../../../../../netlify/functions/process-invoice-costs"
import { processSalesOrderCostsForSystem } from "../../../../../netlify/functions/process-salesorder-costs"
import { getSystemSettings } from "../../../../../netlify/functions/lib/settings"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const activeDocuments = new Set<string>()

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
  const requestedSalesOrderIds: string[] = Array.isArray(body.salesOrderIds)
    ? [...new Set<string>(body.salesOrderIds.map((value: unknown) => String(value)).filter(Boolean))].slice(0, 5)
    : []
  if (requestedIds.length === 0 && requestedSalesOrderIds.length === 0) return NextResponse.json({ success: true, processed: 0 })

  // Repair only current-year invoices and active sales orders that still lack
  // authoritative cost fields. Request limits keep each Zoho batch bounded.
  const now = new Date()
  const phoenixNow = new Date(now.getTime() - 7 * 60 * 60 * 1000)
  const yearStart = new Date(Date.UTC(phoenixNow.getUTCFullYear(), 0, 1, 7))
  const invoices = await prisma.invoice.findMany({
    where: { zohoId: { in: requestedIds }, issueDate: { gte: yearStart } },
    select: { zohoId: true, computedDeadCost: true, items: true },
  })
  const salesOrders = await prisma.salesOrder.findMany({
    where: {
      zohoId: { in: requestedSalesOrderIds },
      orderDate: { gte: yearStart },
      status: { notIn: ["invoiced", "billed", "void", "voided", "declined", "cancelled", "canceled", "draft", "orphaned"] },
    },
    select: { zohoId: true, items: true },
  })

  const results: Array<{ documentId: string; type: "invoice" | "salesorder"; success: boolean }> = []
  for (const invoice of invoices) {
    if (!invoice.zohoId || activeDocuments.has(invoice.zohoId)) continue
    const items = (invoice.items as Record<string, unknown>) || {}
    const storedDeadCost = Number(invoice.computedDeadCost ?? items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? 0)
    const alreadyProcessed = storedDeadCost > 0 || Boolean(items.costsCalculatedAt)
    if (alreadyProcessed) continue

    activeDocuments.add(invoice.zohoId)
    try {
      const response = await processInvoiceCostsForSystem(invoice.zohoId)
      const payload = JSON.parse(response?.body || "{}")
      results.push({ documentId: invoice.zohoId, type: "invoice", success: response?.statusCode === 200 && payload.success === true })
    } catch {
      results.push({ documentId: invoice.zohoId, type: "invoice", success: false })
    } finally {
      activeDocuments.delete(invoice.zohoId)
    }
  }

  for (const salesOrder of salesOrders) {
    if (!salesOrder.zohoId || activeDocuments.has(salesOrder.zohoId)) continue
    const items = (salesOrder.items as Record<string, unknown>) || {}
    const storedDeadCost = Number(items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? 0)
    if (storedDeadCost > 0 || Boolean(items.costsCalculatedAt)) continue

    activeDocuments.add(salesOrder.zohoId)
    try {
      const salesOrderNumber = String(items.salesorder_number || items.salesOrderNumber || "").trim()
      const response = await processSalesOrderCostsForSystem(salesOrder.zohoId, salesOrderNumber || undefined)
      const payload = JSON.parse(response?.body || "{}")
      const success = response?.statusCode === 200 && payload.success === true
      if (response?.statusCode === 404) {
        await prisma.salesOrder.update({
          where: { zohoId: salesOrder.zohoId },
          data: { status: "orphaned", pendingZohoFetch: true },
        })
      }
      results.push({ documentId: salesOrder.zohoId, type: "salesorder", success })
    } catch {
      results.push({ documentId: salesOrder.zohoId, type: "salesorder", success: false })
    } finally {
      activeDocuments.delete(salesOrder.zohoId)
    }
  }

  return NextResponse.json({ success: results.every(result => result.success), processed: results.filter(result => result.success).length, results })
}
