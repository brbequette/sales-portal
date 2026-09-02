import { prisma } from "@/lib/prisma"
import { aggregateShippingCosts } from "@/lib/shipping-costs"
import type { ShippingAllocation } from "@/lib/shipping-costs"
import type { Prisma } from "@prisma/client"

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
const allocationsFrom = (items: Record<string, unknown>) => Array.isArray(items.shippingAllocations) ? items.shippingAllocations as ShippingAllocation[] : []

export async function refreshShippingRollupForSalesOrder(salesOrderId?: string | null, salesOrderNumber?: string | null) {
  if (!salesOrderId && !salesOrderNumber) return { salesOrdersUpdated: 0, invoicesUpdated: 0, total: 0 }

  const packageLinks: Prisma.PackageWhereInput[] = []
  if (salesOrderId) packageLinks.push({ salesOrderId })
  if (salesOrderNumber) packageLinks.push({ salesOrderNumber })
  const packages = await prisma.package.findMany({ where: { OR: packageLinks } })

  const salesOrderLinks: Prisma.SalesOrderWhereInput[] = []
  if (salesOrderId) salesOrderLinks.push({ zohoId: salesOrderId })
  if (salesOrderNumber) {
    salesOrderLinks.push({ items: { path: ["salesOrderNumber"], equals: salesOrderNumber } })
    salesOrderLinks.push({ items: { path: ["salesorder_number"], equals: salesOrderNumber } })
  }
  const salesOrders = salesOrderLinks.length ? await prisma.salesOrder.findMany({ where: { OR: salesOrderLinks } }) : []

  for (const order of salesOrders) {
    const items = asRecord(order.items)
    const shipping = aggregateShippingCosts({ legacyCost: order.actualShippingCost, legacyBreakdown: order.shippingCostBreakdown, allocations: allocationsFrom(items), packages, priorRollup: asRecord(items.shippingRollup) })
    await prisma.salesOrder.update({ where: { id: order.id }, data: { actualShippingCost: shipping.total, shippingCostBreakdown: shipping.breakdown || null, pendingCostSync: true, items: { ...items, actualShippingCost: shipping.total, shippingCostBreakdown: shipping.breakdown, shippingRollup: shipping.rollup } as Prisma.InputJsonValue } })
  }

  const invoiceLinks: Prisma.InvoiceWhereInput[] = []
  if (salesOrderId) {
    invoiceLinks.push({ salesOrderZohoId: salesOrderId })
    invoiceLinks.push({ items: { path: ["salesorder_id"], equals: salesOrderId } })
  }
  if (salesOrderNumber) {
    invoiceLinks.push({ salesorderNumber: salesOrderNumber })
    invoiceLinks.push({ items: { path: ["salesOrderNumber"], equals: salesOrderNumber } })
    invoiceLinks.push({ items: { path: ["salesorder_number"], equals: salesOrderNumber } })
  }
  const invoices = invoiceLinks.length ? await prisma.invoice.findMany({ where: { OR: invoiceLinks } }) : []

  for (const invoice of invoices) {
    const items = asRecord(invoice.items)
    const shipping = aggregateShippingCosts({ legacyCost: invoice.actualShippingCost, legacyBreakdown: invoice.shippingCostBreakdown, allocations: allocationsFrom(items), packages, priorRollup: asRecord(items.shippingRollup) })
    await prisma.invoice.update({ where: { id: invoice.id }, data: { actualShippingCost: shipping.total, shippingCostBreakdown: shipping.breakdown || null, pendingCostSync: true, items: { ...items, actualShippingCost: shipping.total, shippingCostBreakdown: shipping.breakdown, shippingRollup: shipping.rollup } as Prisma.InputJsonValue } })
  }

  return { salesOrdersUpdated: salesOrders.length, invoicesUpdated: invoices.length, total: packages.reduce((sum, pkg) => sum + Number(pkg.shippingCharge || 0), 0) }
}