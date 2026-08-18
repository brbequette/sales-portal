import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from '@netlify/functions'
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const { 
      page = '1', 
      pageSize = '50', 
      search = '', 
      type = 'All', 
      status = '', 
      ownerIds = '', 
      sortBy = 'date-desc',
      loadAll = '',
      startDate = '',
      checkOnly
    } = event.queryStringParameters || {}

    const pageNum = parseInt(page, 10) || 1
    const size = parseInt(pageSize, 10) || 50
    const skip = (pageNum - 1) * size

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const ownerFilterStr = ownerIds ? ownerIds.split(',') : []
    const accountWhere: any = ownerFilterStr.length > 0 ? { ownerId: { in: ownerFilterStr } } : {}

    const invoiceWhere: any = Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}
    const quoteWhere: any = Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}
    const salesOrderWhere: any = Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}

    const isLoadAll = loadAll === 'true'
    const start = startDate ? new Date(startDate) : null

    if (start) {
      invoiceWhere.issueDate = { gte: start }
      quoteWhere.createdAt = { gte: start }
      salesOrderWhere.orderDate = { gte: start }
    } else if (!isLoadAll) {
      invoiceWhere.OR = [
        { status: { notIn: ['paid', 'Paid', 'PAID', 'void', 'Void'] } },
        {
          AND: [
            { status: { in: ['paid', 'Paid', 'PAID'] } },
            {
              OR: [
                { issueDate: { gte: thirtyDaysAgo } },
                { createdAt: { gte: thirtyDaysAgo } }
              ]
            }
          ]
        }
      ]
    }

    const statusFilterArr = status ? status.split(',').filter(Boolean) : []
    const statusFilters = statusFilterArr.map(s => s.toLowerCase())

    // ── checkOnly mode: returns count + latestUpdatedAt only ──────────────
    if (checkOnly === 'true') {
      const [count, latest] = await Promise.all([
        prisma.invoice.count({ where: invoiceWhere }),
        prisma.invoice.findFirst({ where: invoiceWhere, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, checkOnly: true, count, latestUpdatedAt: latest?.updatedAt ?? null })
      }
    }

    // Fetch data from local database in parallel
    const [quotes, salesOrders, invoices] = await Promise.all([
      type === 'All' || type === 'Quote' 
        ? prisma.quote.findMany({ where: quoteWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } } }) 
        : Promise.resolve([]),
      type === 'All' || type === 'SalesOrder' 
        ? prisma.salesOrder.findMany({ where: salesOrderWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } } }) 
        : Promise.resolve([]),
      type === 'All' || type === 'Invoice' 
        ? prisma.invoice.findMany({ where: invoiceWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } } }) 
        : Promise.resolve([])
    ])

    const extractField = (obj: any, key: string): number => {
      if (!obj || typeof obj !== 'object') return 0
      if (obj[key] !== undefined && obj[key] !== null) return parseFloat(obj[key]) || 0
      const cfs = obj.custom_fields || []
      if (Array.isArray(cfs)) {
        const found = cfs.find((f: any) => {
          const apiName = (f.api_name || f.placeholder || '').toLowerCase()
          const labelName = (f.label || '').toLowerCase()
          const target = key.toLowerCase()
          return apiName === target || apiName === `cf_${target}` || labelName === target
        })
        if (found && found.value !== undefined && found.value !== null) {
          return parseFloat(found.value) || 0
        }
      }
      return 0
    }

    const getSubTotal = (items: any, amount: number) => {
      const details = items?.lineItemDetails || items?.line_items || items?.items
      if (Array.isArray(details)) {
        const sum = details.reduce((sum: number, it: any) => {
          if (it.line_item_category === "header" || it.line_item_category === "subtotal") return sum;
          const qty = parseFloat(it.quantity || 0)
          const discountAmount = parseFloat(it.discount_amount || it.discountAmount || 0)
          const rate = parseFloat(it.rate || 0)
          const itemTotal = it.itemTotal !== undefined ? parseFloat(it.itemTotal) : (it.item_total !== undefined ? parseFloat(it.item_total) : ((qty * rate) - discountAmount))
          return sum + itemTotal
        }, 0)
        if (sum > 0) return sum
      }

      let sub = parseFloat(items?.sub_total ?? items?.subTotal ?? 0)
      if (isNaN(sub) || sub === 0) {
        sub = amount || 0
      }
      return sub
    }

    const buildDoc = (raw: any, t: "Quote" | "SalesOrder" | "Invoice") => {
      const items = raw.items as any
      
      let subTotal = parseFloat(raw.amount || 0)
      let profit = 0
      let deadCostNoVig = 0
      let deadCostSubjectToVig = 0
      let commission = 0

      if (items && !Array.isArray(items)) {
        subTotal = getSubTotal(items, raw.amount)
        
        // Use precomputed values from items JSON if available
        if (items.deadProfitActual !== undefined) {
          profit = parseFloat(items.deadProfitActual || 0)
        } else if (items.profit !== undefined && items.deadCostTotal !== undefined) {
          const deadCostTotal = parseFloat(items.deadCostTotal || 0)
          const additionalCosts = parseFloat(items.additionalCosts || 0)
          const ccFees = parseFloat(items.ccFees || 0)
          profit = subTotal - deadCostTotal - additionalCosts - ccFees
        } else {
          let deadCostTotal = parseFloat(items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? extractField(items, 'cf_dead_cost_total') ?? 0)
          if ((isNaN(deadCostTotal) || deadCostTotal === 0) && subTotal > 0) {
            deadCostTotal = subTotal * 0.50
          }
          const additionalCosts = parseFloat(items.additionalCosts ?? items.additional_costs ?? items.cf_additional_costs_to_order ?? extractField(items, 'cf_additional_costs_to_order') ?? 0)
          const ccFees = parseFloat(items.ccFees ?? items.cc_fees ?? items.cf_credit_card_processing_fees ?? extractField(items, 'cf_credit_card_processing_fees') ?? 0)
          const giftCost = parseFloat(items.giftCost ?? items.gifts_cost ?? items.gifts ?? extractField(items, 'cf_gifts') ?? 0)
          profit = subTotal - deadCostTotal - additionalCosts - ccFees - giftCost
        }
        
        deadCostNoVig = parseFloat(items.deadCostNoVig ?? items.cf_dead_cost_no_vig ?? extractField(items, 'cf_dead_cost_no_vig') ?? 0)
        deadCostSubjectToVig = parseFloat(items.deadCostSubjectToVig ?? items.cf_dead_cost_subject_to_vig ?? extractField(items, 'cf_dead_cost_subject_to_vig') ?? 0)
        const rawComm = items.commission ?? items.cf_commision_amount ?? items.salesCommission ?? null
        const parsedComm = rawComm !== null ? parseFloat(rawComm) : extractField(items, 'cf_commision_amount')
        commission = parsedComm || (profit * 0.5) || 0
      } else if (Array.isArray(items)) {
        profit = items.reduce((sum: number, it: any) => {
          const sub = parseFloat(it.sub_total ?? it.subTotal ?? it.amount ?? 0)
          const dc = parseFloat(it.deadCostTotal ?? it.dead_cost_total ?? it.cf_dead_cost_total ?? 0)
          return sum + (sub - dc)
        }, 0)
      }
      
      const statusLower = (raw.status || "").toLowerCase()
      const isPaid = statusLower === "paid" || items?.paymentDate != null
      const isSameDayPaid = items?.isSameDayPaid || false
      const isConvertedToSO = statusLower === 'converted' || items?.salesorder_id || items?.salesorder_number || raw.salesorder_id || raw.salesorder_number || false
      const soStatus = statusLower.trim()
      const isInvoicedOrClosed = soStatus === 'invoiced' || soStatus === 'closed' || soStatus === 'void' || items?.invoice_id || items?.invoice_number || raw.invoice_id || raw.invoice_number || false
      const dueDate = raw.dueDate?.toISOString() || items?.due_date || null
      const balance = parseFloat(items?.balance ?? raw.balance ?? 0)

      const dateStr = raw.issueDate?.toISOString() || raw.orderDate?.toISOString() || raw.createdAt?.toISOString() || new Date().toISOString()
      const statusStr = raw.status || "Draft"
      
      return {
        id: raw.id,
        zohoId: raw.zohoId,
        type: t,
        accountName: raw.account?.name || 'Unknown',
        accountZohoId: raw.account?.zohoId || '',
        accountOwnerId: raw.account?.ownerId || '',
        status: statusStr,
        date: dateStr,
        amount: subTotal,
        profit,
        deadCostNoVig,
        deadCostSubjectToVig,
        commission,
        salesperson: items?.salesperson || items?.salesperson_name || null,
        invoiceNumber: items?.invoiceNumber || items?.invoice_number || items?.estimateNumber || items?.estimate_number || items?.salesOrderNumber || items?.salesorder_number || items?.quoteNumber || (raw.zohoId || raw.id).slice(-6),
        isPaid,
        isSameDayPaid,
        isConvertedToSO,
        isInvoicedOrClosed,
        dueDate,
        balance
      }
    }

    let allDocs: any[] = []
    quotes.forEach((q: any) => allDocs.push(buildDoc(q, "Quote")))
    salesOrders.forEach((s: any) => allDocs.push(buildDoc(s, "SalesOrder")))
    invoices.forEach((i: any) => allDocs.push(buildDoc(i, "Invoice")))

    // Filter by status dropdown
    if (statusFilters.length > 0) {
      allDocs = allDocs.filter(d => {
        const sLower = (d.status || '').toLowerCase()
        return statusFilters.some(f => {
          if (f === 'unpaid') {
            return sLower !== 'paid' && sLower !== 'void' && sLower !== 'voided' && sLower !== 'draft' && sLower !== 'closed'
          }
          return sLower === f
        })
      })
    }

    // Filter by search query
    if (search) {
      allDocs = allDocs.filter(d => 
        d.accountName.toLowerCase().includes(search.toLowerCase()) ||
        d.id.toLowerCase().includes(search.toLowerCase()) ||
        (d.zohoId || "").toLowerCase().includes(search.toLowerCase()) ||
        (d.invoiceNumber || "").toLowerCase().includes(search.toLowerCase())
      )
    }

    // Sort documents
    if (sortBy === "date-desc") {
      allDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    } else if (sortBy === "date-asc") {
      allDocs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    } else if (sortBy === "amount-desc") {
      allDocs.sort((a, b) => b.amount - a.amount)
    } else if (sortBy === "amount-asc") {
      allDocs.sort((a, b) => a.amount - b.amount)
    }

    // Paginate
    const totalCount = allDocs.length
    const paginatedDocs = allDocs.slice(skip, skip + size)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        documents: paginatedDocs,
        pagination: {
          totalCount,
          currentPage: pageNum,
          pageSize: size,
          totalPages: Math.ceil(totalCount / size),
          hasMore: skip + size < totalCount
        }
      })
    }

  } catch (error: any) {
    console.error('Error fetching documents:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Internal server error' })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
