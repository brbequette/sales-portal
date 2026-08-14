import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50))
    
    const search = searchParams.get('search')?.toLowerCase() || ''
    const docType = searchParams.get('docType') || searchParams.get('type') || 'All'
    
    const statusParams = searchParams.get('status')
    const statusFilters = statusParams ? statusParams.split(',').map(s => s.toLowerCase()) : []
    
    const sortBy = searchParams.get('sortBy') || 'date-desc'
    const ownerId = searchParams.get('ownerId')
    const repName = searchParams.get('repName')
    const loadAll = searchParams.get('loadAll') === 'true'
    
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (startDateParam) {
      const date = new Date(startDateParam);
      if (isNaN(date.getTime())) return NextResponse.json({ success: false, error: 'Invalid startDate' }, { status: 400 })
      startDate = date
    }

    if (endDateParam) {
      const date = new Date(endDateParam);
      if (isNaN(date.getTime())) return NextResponse.json({ success: false, error: 'Invalid endDate' }, { status: 400 })
      endDate = date
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Build base account filter
    const accountWhere: any = {}
    if (ownerId && ownerId !== 'All' && ownerId !== 'all') {
      accountWhere.ownerId = ownerId
    }
    if (repName && repName !== 'All' && repName !== 'all') {
      accountWhere.ownerId = repName
    }

    const searchWhere = search ? {
      OR: [
        { id: { contains: search, mode: 'insensitive' } },
        { zohoId: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } }
      ]
    } : {}

    const invoiceDateFilter: any = {}
    if (startDate) invoiceDateFilter.gte = startDate
    if (endDate) invoiceDateFilter.lte = endDate

    const orderQuoteDateFilter: any = {}
    if (startDate) orderQuoteDateFilter.gte = startDate
    if (endDate) orderQuoteDateFilter.lte = endDate

    // Build Invoice WHERE clause
    const invoiceWhere: any = {
      ...(Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}),
      ...(Object.keys(searchWhere).length > 0 ? searchWhere : {})
    }

    if (Object.keys(invoiceDateFilter).length > 0) {
      invoiceWhere.issueDate = invoiceDateFilter
    }

    if (statusFilters.includes('overdue')) {
      invoiceWhere.balance = { gt: 0 }
      invoiceWhere.status = { notIn: ['paid', 'Paid', 'PAID', 'void', 'Void', 'Closed', 'closed', 'Draft', 'draft', 'written_off', 'Written Off', 'WRITTEN_OFF'] }
      invoiceWhere.isWrittenOff = false
    } else if (!loadAll && !startDate && statusFilters.length === 0) {
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
    } else if (statusFilters.length > 0) {
      if (statusFilters.includes('unpaid')) {
        invoiceWhere.status = { notIn: ['paid', 'void', 'voided', 'draft', 'closed', 'Paid', 'Void', 'Voided', 'Draft', 'Closed', 'PAID', 'VOID', 'VOIDED', 'DRAFT', 'CLOSED'] }
      } else {
        const statuses = statusFilters.flatMap(s => [s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1)])
        invoiceWhere.status = { in: statuses }
      }
    }

    // Build Quote & SalesOrder WHERE clauses
    const quoteWhere: any = {
      ...(Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}),
      ...(Object.keys(searchWhere).length > 0 ? searchWhere : {})
    }
    const salesOrderWhere: any = {
      ...(Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}),
      ...(Object.keys(searchWhere).length > 0 ? searchWhere : {})
    }

    if (Object.keys(orderQuoteDateFilter).length > 0) {
      quoteWhere.createdAt = orderQuoteDateFilter
      salesOrderWhere.orderDate = orderQuoteDateFilter
    }

    if (statusFilters.length > 0) {
      if (statusFilters.includes('unpaid')) {
        quoteWhere.status = { notIn: ['paid', 'void', 'voided', 'draft', 'closed', 'Paid', 'Void', 'Voided', 'Draft', 'Closed'] }
        salesOrderWhere.status = { notIn: ['paid', 'void', 'voided', 'draft', 'closed', 'Paid', 'Void', 'Voided', 'Draft', 'Closed'] }
      } else {
        const statuses = statusFilters.flatMap(s => [s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1)])
        quoteWhere.status = { in: statuses }
        salesOrderWhere.status = { in: statuses }
      }
    }

    const skip = (page - 1) * pageSize

    let invoiceOrder: any = { issueDate: 'desc' }
    let quoteOrder: any = { createdAt: 'desc' }
    let soOrder: any = { orderDate: 'desc' }

    if (sortBy === 'date-asc') {
      invoiceOrder = { issueDate: 'asc' }
      quoteOrder = { createdAt: 'asc' }
      soOrder = { orderDate: 'asc' }
    } else if (sortBy === 'amount-desc') {
      invoiceOrder = { amount: 'desc' }
      quoteOrder = { amount: 'desc' }
      soOrder = { amount: 'desc' }
    } else if (sortBy === 'amount-asc') {
      invoiceOrder = { amount: 'asc' }
      quoteOrder = { amount: 'asc' }
      soOrder = { amount: 'asc' }
    }

    const dtLower = docType.toLowerCase()
    const fetchQuotes = dtLower === 'all' || dtLower === 'quote'
    const fetchSalesOrders = dtLower === 'all' || dtLower === 'salesorder'
    const fetchInvoices = dtLower === 'all' || dtLower === 'invoice'

    const [quotes, salesOrders, invoices, quotesCount, salesOrdersCount, invoicesCount] = await Promise.all([
      fetchQuotes ? prisma.quote.findMany({ where: quoteWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } }, orderBy: quoteOrder, skip, take: pageSize }) : Promise.resolve([]),
      fetchSalesOrders ? prisma.salesOrder.findMany({ where: salesOrderWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } }, orderBy: soOrder, skip, take: pageSize }) : Promise.resolve([]),
      fetchInvoices ? prisma.invoice.findMany({ where: invoiceWhere, include: { account: { select: { name: true, zohoId: true, ownerId: true } } }, orderBy: invoiceOrder, skip, take: pageSize }) : Promise.resolve([]),
      fetchQuotes ? prisma.quote.count({ where: quoteWhere }) : Promise.resolve(0),
      fetchSalesOrders ? prisma.salesOrder.count({ where: salesOrderWhere }) : Promise.resolve(0),
      fetchInvoices ? prisma.invoice.count({ where: invoiceWhere }) : Promise.resolve(0)
    ])

    const buildDoc = (raw: any, t: "Quote" | "SalesOrder" | "Invoice") => {
      const items = raw.items as any
      
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

      let profit = 0
      let deadCostNoVig = 0
      let deadCostSubjectToVig = 0
      let commission = 0
      
      let subTotal = parseFloat(raw.amount || 0)
      if (items && !Array.isArray(items)) {
        subTotal = parseFloat(items.sub_total ?? items.subTotal ?? 0)
        if ((isNaN(subTotal) || subTotal === 0) && items.lineItemDetails && Array.isArray(items.lineItemDetails)) {
          subTotal = items.lineItemDetails.reduce((sum: number, it: any) => {
            const qty = parseFloat(it.quantity || 0)
            const rate = parseFloat(it.rate || 0)
            return sum + (qty * rate)
          }, 0)
        }
        if ((isNaN(subTotal) || subTotal === 0) && items.line_items && Array.isArray(items.line_items)) {
          subTotal = items.line_items.reduce((sum: number, it: any) => {
            if (it.line_item_category === "header" || it.line_item_category === "subtotal") return sum;
            const qty = parseFloat(it.quantity || 0)
            const rate = parseFloat(it.rate || 0)
            return sum + (qty * rate)
          }, 0)
        }
        if (isNaN(subTotal) || subTotal === 0) {
          subTotal = parseFloat(raw.amount || 0)
        }

        let deadCostTotal = parseFloat(items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? extractField(items, 'cf_dead_cost_total') ?? 0)
        if ((isNaN(deadCostTotal) || deadCostTotal === 0) && subTotal > 0) {
          deadCostTotal = subTotal * 0.50
        }
        const additionalCosts = parseFloat(items.additionalCosts ?? items.additional_costs ?? items.cf_additional_costs_to_order ?? extractField(items, 'cf_additional_costs_to_order') ?? 0)
        const ccFees = parseFloat(items.ccFees ?? items.cc_fees ?? items.cf_credit_card_processing_fees ?? extractField(items, 'cf_credit_card_processing_fees') ?? 0)
        const giftCost = parseFloat(items.giftCost ?? items.gifts_cost ?? items.gifts ?? extractField(items, 'cf_gifts') ?? 0)
        profit = subTotal - deadCostTotal - additionalCosts - ccFees - giftCost
        
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

    // If 'All' is requested, we need to merge and sort again to return a coherent page
    if (dtLower === 'all' && allDocs.length > 0) {
      if (sortBy === "date-desc") {
        allDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      } else if (sortBy === "date-asc") {
        allDocs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      } else if (sortBy === "amount-desc") {
        allDocs.sort((a, b) => b.amount - a.amount)
      } else if (sortBy === "amount-asc") {
        allDocs.sort((a, b) => a.amount - b.amount)
      }
      // Slice to pageSize since we might have collected up to 3 * pageSize
      allDocs = allDocs.slice(0, pageSize)
    }

    const total = quotesCount + salesOrdersCount + invoicesCount
    const totalPages = Math.ceil(total / pageSize)

    return NextResponse.json({
      success: true,
      documents: allDocs,
      total,
      page,
      pageSize,
      totalPages
    })

  } catch (err: any) {
    console.error('get-documents error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

