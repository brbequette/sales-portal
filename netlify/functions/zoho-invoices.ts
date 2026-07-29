import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { extractProfit, extractCommissionAmount, extractVigRate } from "../../src/lib/custom-field-extractor"

import { zohoCache } from "../../src/lib/services/zohoCache"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const params = event.queryStringParameters || {}
    const statusFilter = params.status || "all"
    const forceRefresh = params.force === "true"
    const cacheKey = `invoices:${statusFilter}`

    if (!forceRefresh) {
      const cachedData = zohoCache.get(cacheKey)
      if (cachedData) {
        return {
          statusCode: 200,
          headers: { ...cors, "X-Cache-Status": "HIT" },
          body: JSON.stringify({ invoices: cachedData })
        }
      }
    }

    const invoiceWhere: any = {}
    if (statusFilter !== "all") {
      const statusMap: Record<string, string[]> = {
        'paid': ['Paid'],
        'unpaid': ['Sent', 'Overdue', 'Partially_Paid', 'Unpaid'],
        'draft': ['Draft'],
        'overdue': ['Overdue'],
      }
      const statuses = statusMap[statusFilter.toLowerCase()]
      if (statuses) {
        invoiceWhere.status = { in: statuses }
      }
    }

    const [invoices, salesOrders] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        include: { account: { select: { name: true } } },
        orderBy: { issueDate: 'desc' },
        take: 1000,
      }),
      prisma.salesOrder.findMany({
        where: {
          status: { in: ['open', 'draft', 'partially_invoiced', 'Open', 'Draft', 'Partially_Invoiced', 'Pending'] }
        },
        include: { account: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 500,
      }),
    ])

    const getSubTotal = (items: any, amount: number) => {
      let sub = parseFloat(items.sub_total ?? items.subTotal ?? 0)
      if (isNaN(sub) || sub === 0) {
        const details = items.lineItemDetails || items.line_items || items.items
        if (Array.isArray(details)) {
          sub = details.reduce((sum: number, it: any) => {
            if (it.line_item_category === "header" || it.line_item_category === "subtotal") return sum;
            const qty = parseFloat(it.quantity || 0)
            const rate = parseFloat(it.rate || it.itemTotal || it.item_total || 0)
            return sum + (qty * rate)
          }, 0)
        }
      }
      if (isNaN(sub) || sub === 0) {
        sub = amount || 0
      }
      return sub
    }

    const invoicesMapped = invoices.map(inv => {
      const items = (inv.items as any) || {}
      const subTotalVal = getSubTotal(items, inv.amount)

      return {
        invoice_id: inv.zohoId,
        invoice_number: items.invoiceNumber || `INV-${inv.zohoId?.slice(-6)}`,
        customer_name: items.customer_name || inv.account?.name || 'Unknown',
        salesperson_name: items.salesperson || null,
        sub_total: subTotalVal,
        total: subTotalVal,
        balance: items.balance ?? 0,
        date: inv.issueDate?.toISOString().split('T')[0] || '',
        due_date: inv.dueDate?.toISOString().split('T')[0] || '',
        status: mapStatusForClient(inv.status),
        is_sales_order: false,
        salesorder_date: items.salesorder_date || null,
        salesorder_salesperson_name: items.salesorder_salesperson_name || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (() => {
          const sub = subTotalVal
          let dc = (items.deadCostTotal ?? 0)
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.50
          return sub - dc
        })(),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shippingCharge ?? 0,
        payment_date: items.paymentDate || null,
      }
    })

    const sosMapped = salesOrders.map(so => {
      const items = (so.items as any) || {}
      const subTotalVal = getSubTotal(items, so.amount)

      return {
        invoice_id: so.zohoId || so.id,
        invoice_number: `SO-${items.salesOrderNumber || so.zohoId?.slice(-6) || so.id.slice(-6)}`,
        customer_name: items.customer_name || so.account?.name || 'Unknown',
        salesperson_name: items.salesperson || null,
        sub_total: subTotalVal,
        total: subTotalVal,
        balance: items.balance ?? so.amount ?? 0,
        date: so.orderDate?.toISOString().split('T')[0] || '',
        due_date: null,
        status: so.status?.toLowerCase() || 'open',
        is_sales_order: true,
        salesorder_date: so.orderDate?.toISOString().split('T')[0] || null,
        salesorder_salesperson_name: items.salesperson || null,
        reference_number: items.reference_number || null,
        cf_profit_unformatted: extractProfit(items),
        deadProfit: (() => {
          const sub = subTotalVal
          let dc = (items.deadCostTotal ?? 0)
          if ((isNaN(dc) || dc === 0) && sub > 0) dc = sub * 0.50
          return sub - dc
        })(),
        cf_commision_amount_unformatted: extractCommissionAmount(items),
        cf_salesperson_vig_unformatted: extractVigRate(items),
        line_items: items.line_items || [],
        custom_fields: items.custom_fields || [],
        shipping_charge: items.shippingCharge ?? 0,
      }
    })


    const combined = [...invoicesMapped, ...sosMapped].sort((a: any, b: any) => {
      const dateA = a.salesorder_date || a.date
      const dateB = b.salesorder_date || b.date
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

    zohoCache.set(cacheKey, combined, 3 * 60 * 1000)

    return {
      statusCode: 200,
      headers: { ...cors, "X-Cache-Status": "MISS" },
      body: JSON.stringify({ invoices: combined })
    }
  } catch (err: any) {
    console.error('zoho-invoices function error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message })
    }
  }
}

function mapStatusForClient(status: string): string {
  const lower = status?.toLowerCase() || ''
  if (lower === 'paid' || lower === 'closed') return 'paid'
  if (lower === 'sent' || lower === 'unpaid' || lower === 'partially_paid' || lower === 'overdue') return lower
  if (lower === 'draft') return 'draft'
  if (lower === 'void' || lower === 'voided') return 'void'
  return lower || 'draft'
}

function extractCustomField(items: any, fieldName: string): number | null {
  if (!items.custom_fields || !Array.isArray(items.custom_fields)) return null
  const field = items.custom_fields.find((f: any) => f.api_name === fieldName || f.label === fieldName)
  if (field && field.value !== undefined && field.value !== '') {
    return parseFloat(field.value) || 0
  }
  return null
}
