import { PrismaClient } from "@prisma/client"
import { calculateDocumentCosts } from "../netlify/functions/lib/cost-calculations"

const prisma = new PrismaClient()

async function main() {
  console.log("=== STARTING SYSTEM-WIDE VIG COST RECALCULATION ===")

  // 1. Process Invoices
  const invoices = await prisma.invoice.findMany()
  console.log(`Found ${invoices.length} invoices to evaluate...`)

  let invUpdated = 0
  for (const inv of invoices) {
    const items = (inv.items as any) || {}
    const rawLineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    // Prepare doc payload for cost calculator
    const doc = {
      ...inv,
      ...items,
      line_items: rawLineItems,
      date: inv.issueDate || inv.createdAt,
      sub_total: parseFloat(items.sub_total || items.subTotal) || inv.amount || 0,
      custom_fields: items.custom_fields || [],
      salesperson_name: items.salesperson || ""
    }

    try {
      const calc = await calculateDocumentCosts(doc)
      const {
        deadCostSubjectToVig,
        deadCostNoVig,
        deadCostTotal,
        vigRate,
        deadCostPlusVig,
        profit,
        deadProfitActual,
        lineItemDetails,
        lineItemBreakdownStrings
      } = calc

      // Update items JSON
      const updatedItems = {
        ...items,
        deadCostTotal,
        deadCostSubjectToVig,
        deadCostNoVig,
        deadCostPlusVig,
        deadProfitActual,
        profit,
        vigRate,
        lineItemDetails,
        itemsDcBreakdown: lineItemBreakdownStrings
      }

      await prisma.invoice.update({
        where: { id: inv.id },
        data: { items: updatedItems }
      })

      invUpdated++
    } catch (e: any) {
      console.error(`Failed to process invoice ${inv.id}: ${e.message}`)
    }
  }
  console.log(`✅ Recalculated ${invUpdated} invoices!`)

  // 2. Process Sales Orders
  const salesOrders = await prisma.salesOrder.findMany()
  console.log(`Found ${salesOrders.length} sales orders to evaluate...`)

  let soUpdated = 0
  for (const so of salesOrders) {
    const items = (so.items as any) || {}
    const rawLineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    const doc = {
      ...so,
      ...items,
      line_items: rawLineItems,
      date: so.orderDate || so.createdAt,
      sub_total: parseFloat(items.sub_total || items.subTotal) || so.amount || 0,
      custom_fields: items.custom_fields || [],
      salesperson_name: items.salesperson || ""
    }

    try {
      const calc = await calculateDocumentCosts(doc)
      const {
        deadCostSubjectToVig,
        deadCostNoVig,
        deadCostTotal,
        vigRate,
        deadCostPlusVig,
        profit,
        deadProfitActual,
        lineItemDetails,
        lineItemBreakdownStrings
      } = calc

      const updatedItems = {
        ...items,
        deadCostTotal,
        deadCostSubjectToVig,
        deadCostNoVig,
        deadCostPlusVig,
        deadProfitActual,
        profit,
        vigRate,
        lineItemDetails,
        itemsDcBreakdown: lineItemBreakdownStrings
      }

      await prisma.salesOrder.update({
        where: { id: so.id },
        data: { items: updatedItems }
      })

      soUpdated++
    } catch (e: any) {
      console.error(`Failed to process sales order ${so.id}: ${e.message}`)
    }
  }
  console.log(`✅ Recalculated ${soUpdated} sales orders!`)

  console.log("=== VIG RECALCULATION COMPLETE ===")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration error:", err)
    process.exit(1)
  })
