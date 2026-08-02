import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['Draft', 'draft', 'Void', 'void'] },
        OR: [
          { actualShippingCost: null },
          { actualShippingCost: 0 },
        ]
      },
      orderBy: { issueDate: 'desc' },
      take: 100
    })

    const formatted = invoices.map(inv => {
      const items: any = inv.items || {}
      const lineItems: any[] = items.line_items || []
      const allocations: any[] = items.shippingAllocations || []

      // Identify SKUs/items covered
      const coveredSkus = new Set<string>()
      allocations.forEach(a => {
        (a.itemSkus || []).forEach((sku: string) => coveredSkus.add(sku.toLowerCase()))
      })

      const lineItemStatuses = lineItems.map(it => {
        const name = it.name || "Item"
        const sku = it.sku || it.code || name
        const isCovered = coveredSkus.has(sku.toLowerCase()) || coveredSkus.has(name.toLowerCase())
        return {
          name,
          sku,
          quantity: it.quantity || 1,
          rate: it.rate || 0,
          isCovered
        }
      })

      const missingCount = lineItemStatuses.filter(it => !it.isCovered).length

      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber: items.invoiceNumber || items.invoice_number || inv.zohoId,
        customerName: items.customer_name || "Customer",
        amount: inv.amount,
        issueDate: inv.issueDate,
        status: inv.status,
        actualShippingCost: inv.actualShippingCost || 0,
        shippingCostBreakdown: inv.shippingCostBreakdown || null,
        lineItems: lineItemStatuses,
        totalItemsCount: lineItemStatuses.length,
        missingItemsCount: missingCount,
        isFullyCovered: missingCount === 0 && (inv.actualShippingCost || 0) > 0
      }
    })

    return NextResponse.json({
      success: true,
      totalInvoicesMissingShipping: formatted.length,
      invoices: formatted
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
