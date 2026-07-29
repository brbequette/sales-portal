import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10)
    const search = searchParams.get('search')?.toLowerCase() || ''
    const type = searchParams.get('type') || 'All'
    const statusParams = searchParams.get('status')
    const statusFilters = statusParams ? statusParams.split(',').map(s => s.toLowerCase()) : []
    const sortBy = searchParams.get('sortBy') || 'date-desc'
    const ownerId = searchParams.get('ownerId')
    const loadAll = searchParams.get('loadAll') === 'true'
    const startDateParam = searchParams.get('startDate')
    const startDate = startDateParam ? new Date(startDateParam) : null

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Build base account filter (filter by current Account Owner, NOT historical salesman)
    const accountWhere: any = {}
    if (ownerId && ownerId !== 'All' && ownerId !== 'all') {
      accountWhere.ownerId = ownerId
    }

    // Build Invoice WHERE clause
    const invoiceWhere: any = {
      ...(Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {})
    }

    if (startDate) {
      invoiceWhere.issueDate = { gte: startDate }
    } else if (!loadAll) {
      // Default initial view: Only open invoices OR paid invoices less than 30 days old
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

    // Build Quote & SalesOrder WHERE clauses
    const quoteWhere: any = Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}
    const salesOrderWhere: any = Object.keys(accountWhere).length > 0 ? { account: accountWhere } : {}

    if (startDate) {
      quoteWhere.createdAt = { gte: startDate }
      salesOrderWhere.orderDate = { gte: startDate }
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
      
      if (items && !Array.isArray(items)) {
        // Calculate raw non-VIG profit (Dead Profit)
        const subTotal = parseFloat(items.sub_total ?? items.subTotal ?? raw.amount ?? 0)
        const deadCostTotal = parseFloat(items.deadCostTotal ?? items.dead_cost_total ?? items.cf_dead_cost_total ?? extractField(items, 'cf_dead_cost_total') ?? 0)
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
        // Fallback for arrays
        profit = items.reduce((sum: number, it: any) => {
          const sub = parseFloat(it.sub_total ?? it.subTotal ?? it.amount ?? 0)
          const dc = parseFloat(it.deadCostTotal ?? it.dead_cost_total ?? it.cf_dead_cost_total ?? 0)
          return sum + (sub - dc)
        }, 0)
      }
      
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
        amount: parseFloat(raw.amount || 0),
        profit,
        deadCostNoVig,
        deadCostSubjectToVig,
        commission,
        salesperson: items?.salesperson || items?.salesperson_name || null,
        invoiceNumber: items?.invoiceNumber || items?.invoice_number || items?.estimateNumber || items?.estimate_number || items?.salesOrderNumber || items?.salesorder_number || items?.quoteNumber || (raw.zohoId || raw.id).slice(-6),
        raw
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
        d.accountName.toLowerCase().includes(search) ||
        d.id.toLowerCase().includes(search) ||
        (d.zohoId || "").toLowerCase().includes(search) ||
        (d.invoiceNumber || "").toLowerCase().includes(search)
      )
    }

    // Sort documents
    if (sortBy === "date-desc") {
      allDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    } else if (sortBy === "date-asc") {
      allDocs.sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime())
    } else if (sortBy === "amount-desc") {
      allDocs.sort((a, b) => b.amount - a.amount)
    } else if (sortBy === "amount-asc") {
      allDocs.sort((a, b) => a.amount - b.amount)
    }

    // Paginate
    const totalCount = allDocs.length
    const startIndex = (page - 1) * pageSize
    const paginatedDocs = allDocs.slice(startIndex, startIndex + pageSize)

    return NextResponse.json({
      success: true,
      documents: paginatedDocs,
      pagination: { totalCount }
    })

  } catch (err: any) {
    console.error('get-documents error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
