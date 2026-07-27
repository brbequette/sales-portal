import { Handler } from '@netlify/functions'

import { prisma } from "./lib/prisma"

export const handler: Handler = async (event, context) => {
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
      sortBy = 'date-desc' 
    } = event.queryStringParameters || {}

    const pageNum = parseInt(page, 10) || 1
    const size = parseInt(pageSize, 10) || 50
    const skip = (pageNum - 1) * size

    // Build Prisma query clauses based on requested type (Quote, SalesOrder, Invoice, All)
    // For simplicity, we query the exact tables requested and then merge/sort in JS, 
    // or if "All", we query all 3 and merge.
    
    // To implement proper pagination across 3 tables efficiently, we will do concurrent counts,
    // but merging sorted results with SKIP/TAKE across 3 tables is complex in Prisma. 
    // Since we only really care about getting paginated docs, an alternative is querying all matching 
    // docs (lightweight fields), sorting, and slicing.
    
    let quotes: any[] = []
    let salesOrders: any[] = []
    let invoices: any[] = []

    const searchFilter = search ? {
      OR: [
        { estimate_number: { contains: search, mode: 'insensitive' as const } },
        { salesorder_number: { contains: search, mode: 'insensitive' as const } },
        { invoice_number: { contains: search, mode: 'insensitive' as const } },
        { account: { name: { contains: search, mode: 'insensitive' as const } } }
      ]
    } : {}

    // Owner filter
    const ownerFilterStr = ownerIds ? ownerIds.split(',') : []
    const accountFilter = ownerFilterStr.length > 0 ? {
      account: { ownerId: { in: ownerFilterStr } }
    } : {}

    const statusFilterArr = status ? status.split(',').filter(Boolean) : []
    const statusFilterClause = statusFilterArr.length > 0 ? {
      status: { in: statusFilterArr }
    } : {}

    if (type === 'All' || type === 'Quote') {
      quotes = await prisma.quote.findMany({
        where: {
          ...accountFilter,
          ...statusFilterClause,
          ...(search ? {
            OR: [
              { estimate_number: { contains: search, mode: 'insensitive' } },
              { account: { name: { contains: search, mode: 'insensitive' } } }
            ]
          } : {})
        },
        include: { account: { select: { name: true, zohoId: true, ownerId: true } } },
      })
    }

    if (type === 'All' || type === 'SalesOrder') {
      salesOrders = await prisma.salesOrder.findMany({
        where: {
          ...accountFilter,
          ...statusFilterClause,
          ...(search ? {
            OR: [
              { salesorder_number: { contains: search, mode: 'insensitive' } },
              { account: { name: { contains: search, mode: 'insensitive' } } }
            ]
          } : {})
        },
        include: { account: { select: { name: true, zohoId: true, ownerId: true } } },
      })
    }

    if (type === 'All' || type === 'Invoice') {
      invoices = await prisma.invoice.findMany({
        where: {
          ...accountFilter,
          ...statusFilterClause,
          ...(search ? {
            OR: [
              { invoice_number: { contains: search, mode: 'insensitive' } },
              { account: { name: { contains: search, mode: 'insensitive' } } }
            ]
          } : {})
        },
        include: { account: { select: { name: true, zohoId: true, ownerId: true } } },
      })
    }

    // Map them into a unified format
    let allDocs = [
      ...quotes.map(q => ({
        id: q.id,
        zohoId: q.zohoId,
        type: 'Quote',
        accountName: q.account?.name || 'Unknown',
        accountZohoId: q.account?.zohoId || '',
        ownerId: q.account?.ownerId || '',
        status: q.status || 'Draft',
        date: q.date ? new Date(q.date).getTime() : 0,
        amount: parseFloat(q.total || '0'),
        profit: parseFloat(q.cf_profit_unformatted || '0'),
        invoiceNumber: q.estimate_number,
        raw: q
      })),
      ...salesOrders.map(s => ({
        id: s.id,
        zohoId: s.zohoId,
        type: 'SalesOrder',
        accountName: s.account?.name || 'Unknown',
        accountZohoId: s.account?.zohoId || '',
        ownerId: s.account?.ownerId || '',
        status: s.status || 'Draft',
        date: s.date ? new Date(s.date).getTime() : 0,
        amount: parseFloat(s.total || '0'),
        profit: parseFloat(s.cf_profit_unformatted || '0'),
        invoiceNumber: s.salesorder_number,
        raw: s
      })),
      ...invoices.map(i => ({
        id: i.id,
        zohoId: i.zohoId,
        type: 'Invoice',
        accountName: i.account?.name || 'Unknown',
        accountZohoId: i.account?.zohoId || '',
        ownerId: i.account?.ownerId || '',
        status: i.status || 'Draft',
        date: i.date ? new Date(i.date).getTime() : 0,
        amount: parseFloat(i.total || '0'),
        profit: parseFloat(i.cf_profit_unformatted || '0'),
        invoiceNumber: i.invoice_number,
        raw: i
      }))
    ]

    // Sort in memory
    allDocs.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc': return b.date - a.date;
        case 'date-asc': return a.date - b.date;
        case 'amount-desc': return b.amount - a.amount;
        case 'amount-asc': return a.amount - b.amount;
        default: return b.date - a.date;
      }
    });

    const totalCount = allDocs.length;
    const paginatedDocs = allDocs.slice(skip, skip + size);

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
