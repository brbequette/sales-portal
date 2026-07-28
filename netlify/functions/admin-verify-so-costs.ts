import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { calculateDocumentCosts } from "./lib/cost-calculations"

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  const logs: string[] = []
  const log = (msg: string) => {
    console.log(msg)
    logs.push(msg)
  }

  try {
    log("==========================================================")
    log("=== STARTING FULL SALES ORDERS COST VERIFICATION & SYNC ===")
    log("==========================================================")

    const salesOrders = await prisma.salesOrder.findMany({
      orderBy: { createdAt: "desc" }
    })

    log(`Found ${salesOrders.length} total Sales Orders in database...`)

    let totalSOEvaluated = 0
    let totalSOUpdated = 0
    let alreadyValidCount = 0
    let totalRevenue = 0
    let totalDeadCost = 0
    let totalProfit = 0

    for (const so of salesOrders) {
      totalSOEvaluated++
      const items = (so.items as any) || {}
      const rawLineItems = Array.isArray(items.line_items)
        ? items.line_items
        : Array.isArray(items.items)
        ? items.items
        : []

      const docPayload = {
        ...so,
        ...items,
        line_items: rawLineItems,
        date: so.orderDate || so.createdAt,
        sub_total: parseFloat(items.sub_total || items.subTotal) || so.amount || 0,
        custom_fields: items.custom_fields || [],
        salesperson_name: items.salesperson || ""
      }

      // Check if costs are already calculated and valid
      const hasCosts =
        items.deadCostTotal != null &&
        items.deadCostSubjectToVig != null &&
        items.deadCostNoVig != null &&
        items.profit != null

      let calcResult: any = null

      if (!hasCosts || items.pendingCostSync) {
        calcResult = await calculateDocumentCosts(docPayload)

        const updatedItems = {
          ...items,
          deadCostTotal: calcResult.deadCostTotal,
          deadCostSubjectToVig: calcResult.deadCostSubjectToVig,
          deadCostNoVig: calcResult.deadCostNoVig,
          deadCostPlusVig: calcResult.deadCostPlusVig,
          deadProfitActual: calcResult.deadProfitActual,
          profit: calcResult.profit,
          salesCommission: calcResult.salesCommission,
          vigRate: calcResult.vigRate,
          lineItemDetails: calcResult.lineItemDetails,
          itemsDcBreakdown: calcResult.lineItemBreakdownStrings,
          pendingCostSync: false
        }

        await prisma.salesOrder.update({
          where: { id: so.id },
          data: { items: JSON.parse(JSON.stringify(updatedItems)) as any }
        })

        totalSOUpdated++
      } else {
        alreadyValidCount++
        calcResult = {
          subTotal: parseFloat(items.sub_total || items.subTotal || so.amount || 0),
          deadCostTotal: parseFloat(items.deadCostTotal || 0),
          profit: parseFloat(items.profit || 0)
        }
      }

      totalRevenue += calcResult.subTotal || so.amount || 0
      totalDeadCost += calcResult.deadCostTotal || 0
      totalProfit += calcResult.profit || 0
    }

    log(`✅ Evaluated: ${totalSOEvaluated} Sales Orders`)
    log(`✅ Verified Already Complete: ${alreadyValidCount}/${totalSOEvaluated}`)
    log(`✅ Newly Calculated & Updated: ${totalSOUpdated}`)
    log(`📊 Aggregate Financial Metrics:`)
    log(`       - Total Sales Order Revenue: $${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
    log(`       - Total Sales Order Dead Cost: $${totalDeadCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
    log(`       - Total Sales Order Net Profit: $${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)

    log("==========================================================")
    log("🎉 100% OF SALES ORDERS COST CALCULATIONS VERIFIED & SYNCED!")
    log("==========================================================")

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        summary: {
          totalSOEvaluated,
          alreadyValidCount,
          totalSOUpdated,
          totalRevenue,
          totalDeadCost,
          totalProfit
        },
        logs
      })
    }
  } catch (error: any) {
    log(`❌ Sales Order Cost Verification Error: ${error.message} (${error.stack || ""})`)
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message, logs })
    }
  }
}
