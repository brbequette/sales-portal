import { prisma } from '@/lib/prisma';
import { NextResponse } from "next/server"

import { calculateDocumentCosts, buildFieldsToUpdate } from "../../../../../../netlify/functions/lib/cost-calculations"

export async function POST(req: Request) {
  try {
    const { invoiceId, selectedItemSkus, shippingCost, carrier, trackingNumber, notes } = await req.json()

    if (!invoiceId || !shippingCost) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const dbInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: invoiceId },
          { zohoId: invoiceId },
          { items: { path: ['invoiceNumber'], equals: invoiceId } }
        ]
      }
    })

    if (!dbInvoice) {
      return NextResponse.json({ success: false, error: `Invoice '${invoiceId}' not found` }, { status: 404 })
    }

    const currentItems: any = dbInvoice.items || {}
    const currentAllocations: any[] = currentItems.shippingAllocations || []

    const skusCovered: string[] = Array.isArray(selectedItemSkus) ? selectedItemSkus : []

    const newAllocation = {
      id: `alloc_${Date.now()}`,
      carrier: carrier || "Freight/Shipment",
      trackingNumber: trackingNumber || null,
      cost: parseFloat(shippingCost),
      notes: notes || null,
      itemSkus: skusCovered,
      createdAt: new Date().toISOString()
    }

    const updatedAllocations = [...currentAllocations, newAllocation]

    // Calculate total actual shipping cost
    const totalActualShipping = updatedAllocations.reduce((sum, a) => sum + (a.cost || 0), 0)

    // Build itemized breakdown text
    const breakdownLines = updatedAllocations.map(a => {
      const carrierStr = a.carrier || "Shipment"
      const trackStr = a.trackingNumber ? `#${a.trackingNumber}` : ""
      const itemsStr = a.itemSkus.length > 0 ? ` -> Covers: [${a.itemSkus.join(", ")}]` : ""
      return `${carrierStr} ${trackStr} ($${a.cost.toFixed(2)})${itemsStr}`
    })

    const shippingCostBreakdown = breakdownLines.join("\n")

    const newItems = {
      ...currentItems,
      shippingAllocations: updatedAllocations,
      actualShippingCost: totalActualShipping,
      shippingCostBreakdown,
      cf_actual_shipping_cost: totalActualShipping,
      cf_shipping_cost_breakdown: shippingCostBreakdown
    }

    // Trigger recalculation to update calculated fields
    const doc = {
      invoice_id: dbInvoice.zohoId,
      invoice_number: currentItems.invoiceNumber || currentItems.invoice_number,
      sub_total: currentItems.sub_total || dbInvoice.amount,
      line_items: currentItems.line_items || [],
      custom_fields: currentItems.custom_fields || [],
      status: dbInvoice.status,
      balance: currentItems.balance ?? 0
    }

    const calc = await calculateDocumentCosts(doc)

    await prisma.invoice.update({
      where: { id: dbInvoice.id },
      data: {
        items: {
          ...newItems,
          profit: calc.profit,
          commission: calc.salesCommission,
          totalDeductions: calc.totalDeductions,
        },
        actualShippingCost: totalActualShipping,
        shippingCostBreakdown,
      }
    })

    return NextResponse.json({
      success: true,
      actualShippingCost: totalActualShipping,
      shippingCostBreakdown,
      message: `Assigned $${parseFloat(shippingCost).toFixed(2)} shipping cost covering ${skusCovered.length} item(s).`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
