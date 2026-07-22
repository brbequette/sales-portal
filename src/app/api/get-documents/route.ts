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

    if (!loadAll) {
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
      let profit = 0
      const items = raw.items as any
      if (items && !Array.isArray(items) && items.profit) {
        profit = parseFloat(items.profit)
      } else if (Array.isArray(items)) {
        profit = items.reduce((sum: number, it: any) => sum + parseFloat(it.profit || 0), 0)
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
