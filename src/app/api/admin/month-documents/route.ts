import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSystemSettings } from "@/lib/settings"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { searchParams } = new URL(req.url)
    const monthKey = searchParams.get("monthKey") || ""
    const repId = searchParams.get("repId") || "all"

    if (!monthKey) {
      return NextResponse.json({ success: false, error: "monthKey is required" }, { status: 400 })
    }

    const settings = await getSystemSettings()
    const targetVig = settings.target_vig_rate || 1.5
    const baselineVig = settings.baseline_vig_rate || 1.3

    const [yyyy, mm] = monthKey.split("-").map(Number)
    const startDate = new Date(yyyy, mm - 1, 1)
    const endDate = new Date(yyyy, mm, 0, 23, 59, 59, 999)

    // Build user filter if repId is specified
    let targetOwnerId: string | null = null
    if (repId !== "all") {
      const user = await prisma.user.findUnique({ where: { id: repId } })
      if (user) targetOwnerId = user.id
    }

    // 1. Invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: startDate, lte: endDate },
        NOT: { status: { in: ["Void", "Draft"] } },
        ...(targetOwnerId ? { account: { ownerId: targetOwnerId } } : {}),
      },
      select: {
        id: true,
        zohoId: true,
        issueDate: true,
        amount: true,
        status: true,
        items: true,
        account: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { issueDate: "desc" },
    })

    // 2. Sales Orders (uses orderDate & amount)
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        orderDate: { gte: startDate, lte: endDate },
        NOT: { status: { in: ["void", "draft"] } },
        ...(targetOwnerId ? { account: { ownerId: targetOwnerId } } : {}),
      },
      select: {
        id: true,
        zohoId: true,
        orderDate: true,
        amount: true,
        status: true,
        items: true,
        account: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { orderDate: "desc" },
    })

    // 3. Quotes / Estimates (uses createdAt & amount)
    const quotes = await prisma.quote.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        NOT: { status: { in: ["declined", "draft"] } },
        ...(targetOwnerId ? { account: { ownerId: targetOwnerId } } : {}),
      },
      select: {
        id: true,
        zohoId: true,
        createdAt: true,
        amount: true,
        status: true,
        items: true,
        account: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const documents: any[] = []

    // Helper to calculate VIG numbers for a document
    const processDoc = (
      docId: string,
      zohoId: string,
      docNumber: string,
      dateStr: string,
      docType: "Invoice" | "Sales Order" | "Estimate",
      status: string,
      rawSubtotal: number,
      rawItems: any,
      customerName: string
    ) => {
      const itemsObj = (rawItems as any) || {}
      const subtotal = parseFloat(itemsObj.sub_total || itemsObj.subTotal) || rawSubtotal || 0
      const deadCost = parseFloat(itemsObj.deadCostTotal || itemsObj.dead_cost_total || 0) || 0
      const ccFees = parseFloat(itemsObj.ccFees || 0) || 0
      const addCosts = parseFloat(itemsObj.additionalCosts || 0) || 0

      // Baseline profit at 1.3 VIG
      const deadProfitBaseline = subtotal - deadCost - addCosts - ccFees

      // Target profit at 1.5 VIG (If priced at 1.5x multiplier instead of 1.3x)
      const subtotalTarget = deadCost > 0 ? deadCost * targetVig : subtotal * (targetVig / baselineVig)
      const deadProfitTarget = subtotalTarget - deadCost - addCosts - ccFees

      // Loss or Variance (1.5 VIG profit - 1.3 VIG profit)
      const lossToTarget = Math.max(0, deadProfitTarget - deadProfitBaseline)

      documents.push({
        id: docId,
        zohoId: zohoId || docId,
        number: docNumber || "N/A",
        date: dateStr,
        docType,
        status: status || "active",
        customerName: customerName || "Unknown Customer",
        subtotal,
        deadCost,
        deadProfitBaseline,
        deadProfitTarget,
        lossToTarget,
      })
    }

    invoices.forEach((inv: any) => {
      const items = inv.items || {}
      const num = items.invoice_number || items.invoiceNumber || inv.zohoId || inv.id
      processDoc(
        inv.id,
        inv.zohoId,
        num,
        inv.issueDate ? new Date(inv.issueDate).toISOString().split("T")[0] : "",
        "Invoice",
        inv.status,
        parseFloat(inv.amount || 0),
        inv.items,
        inv.account?.name || "Unknown"
      )
    })

    salesOrders.forEach((so: any) => {
      const items = so.items || {}
      const num = items.salesorder_number || items.salesorderNumber || so.zohoId || so.id
      processDoc(
        so.id,
        so.zohoId,
        num,
        so.orderDate ? new Date(so.orderDate).toISOString().split("T")[0] : "",
        "Sales Order",
        so.status,
        parseFloat(so.amount || 0),
        so.items,
        so.account?.name || "Unknown"
      )
    })

    quotes.forEach((q: any) => {
      const items = q.items || {}
      const num = items.quote_number || items.quoteNumber || q.zohoId || q.id
      processDoc(
        q.id,
        q.zohoId,
        num,
        q.createdAt ? new Date(q.createdAt).toISOString().split("T")[0] : "",
        "Estimate",
        q.status,
        parseFloat(q.amount || 0),
        q.items,
        q.account?.name || "Unknown"
      )
    })

    // Totals
    const totalSubtotal = documents.reduce((sum, d) => sum + d.subtotal, 0)
    const totalDeadCost = documents.reduce((sum, d) => sum + d.deadCost, 0)
    const totalBaselineProfit = documents.reduce((sum, d) => sum + d.deadProfitBaseline, 0)
    const totalTargetProfit = documents.reduce((sum, d) => sum + d.deadProfitTarget, 0)
    const totalLossToTarget = documents.reduce((sum, d) => sum + d.lossToTarget, 0)

    return NextResponse.json({
      success: true,
      monthKey,
      settings: {
        baselineVig,
        targetVig,
      },
      totals: {
        subtotal: totalSubtotal,
        deadCost: totalDeadCost,
        baselineProfit: totalBaselineProfit,
        targetProfit: totalTargetProfit,
        lossToTarget: totalLossToTarget,
        documentCount: documents.length,
      },
      documents,
    })
  } catch (error: any) {
    console.error("Error fetching month documents:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
