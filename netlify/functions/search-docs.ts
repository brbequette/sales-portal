import { Handler } from '@netlify/functions'
import prisma from './lib/prisma'

type UnifiedDoc = {
  id: string
  zohoId: string | null
  type: 'invoice' | 'quote' | 'salesorder'
  docNumber: string
  customerName: string
  repName: string
  date: string // ISO
  amount: number
  status: string
  items: any
}

export const handler: Handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const {
      type = 'all',
      status,
      repId,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
      q,
      sort = 'date',
      dir = 'desc',
      page = '1',
      limit = '50',
      callerDbId,
      callerRole,
    } = event.queryStringParameters || {}

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const isAdmin = callerRole?.includes('admin')
    const ownerIdFilter = isAdmin ? (repId ? { equals: repId } : undefined) : (callerDbId ? { equals: callerDbId } : undefined)

    const accountFilter = ownerIdFilter ? { ownerId: ownerIdFilter } : undefined

    let allDocs: UnifiedDoc[] = []

    if (type === 'all' || type === 'invoice') {
      const invoices = await prisma.invoice.findMany({
        where: {
          ...(status && { status: { equals: status, mode: 'insensitive' } }),
          ...(dateFrom || dateTo ? { issueDate: { gte: dateFrom ? new Date(dateFrom as string) : undefined, lte: dateTo ? new Date(dateTo as string) : undefined } } : {}),
          ...(amountMin || amountMax ? { amount: { gte: amountMin ? parseFloat(amountMin as string) : undefined, lte: amountMax ? parseFloat(amountMax as string) : undefined } } : {}),
          ...(accountFilter && { account: accountFilter }),
        },
        include: { account: { include: { owner: true } } },
      })
      allDocs.push(...invoices.map(i => ({
        id: i.id,
        zohoId: i.zohoId,
        type: 'invoice' as const,
        docNumber: (i.items as any)?.invoiceNumber || i.id.slice(0,8),
        customerName: i.account?.name || 'Unknown Customer',
        repName: i.account?.owner?.name || 'Unknown Rep',
        date: i.issueDate ? i.issueDate.toISOString() : (i as any).createdAt?.toISOString() || new Date().toISOString(),
        amount: Number(i.amount) || 0,
        status: i.status || 'Draft',
        items: i.items,
      })))
    }

    if (type === 'all' || type === 'quote') {
      const quotes = await prisma.quote.findMany({
        where: {
          ...(status && { status: { equals: status, mode: 'insensitive' } }),
          ...(dateFrom || dateTo ? { createdAt: { gte: dateFrom ? new Date(dateFrom as string) : undefined, lte: dateTo ? new Date(dateTo as string) : undefined } } : {}),
          ...(amountMin || amountMax ? { amount: { gte: amountMin ? parseFloat(amountMin as string) : undefined, lte: amountMax ? parseFloat(amountMax as string) : undefined } } : {}),
          ...(accountFilter && { account: accountFilter }),
        },
        include: { account: { include: { owner: true } } },
      })
      allDocs.push(...quotes.map(q => ({
        id: q.id,
        zohoId: q.zohoId,
        type: 'quote' as const,
        docNumber: (q.items as any)?.estimateNumber || q.id.slice(0,8),
        customerName: q.account?.name || 'Unknown Customer',
        repName: q.account?.owner?.name || 'Unknown Rep',
        date: (q.items as any)?.date ? new Date((q.items as any).date).toISOString() : q.createdAt.toISOString(),
        amount: Number(q.amount) || 0,
        status: q.status || 'Draft',
        items: q.items,
      })))
    }

    if (type === 'all' || type === 'salesorder') {
      const salesOrders = await prisma.salesOrder.findMany({
        where: {
          ...(status && { status: { equals: status, mode: 'insensitive' } }),
          ...(dateFrom || dateTo ? { orderDate: { gte: dateFrom ? new Date(dateFrom as string) : undefined, lte: dateTo ? new Date(dateTo as string) : undefined } } : {}),
          ...(amountMin || amountMax ? { amount: { gte: amountMin ? parseFloat(amountMin as string) : undefined, lte: amountMax ? parseFloat(amountMax as string) : undefined } } : {}),
          ...(accountFilter && { account: accountFilter }),
        },
        include: { account: { include: { owner: true } } },
      })
      allDocs.push(...salesOrders.map(so => ({
        id: so.id,
        zohoId: so.zohoId,
        type: 'salesorder' as const,
        docNumber: (so.items as any)?.salesOrderNumber || so.id.slice(0,8),
        customerName: so.account?.name || 'Unknown Customer',
        repName: so.account?.owner?.name || 'Unknown Rep',
        date: so.orderDate ? so.orderDate.toISOString() : (so as any).createdAt?.toISOString() || new Date().toISOString(),
        amount: Number(so.amount) || 0,
        status: so.status || 'Draft',
        items: so.items,
      })))
    }

    if (q) {
      const qLower = (q as string).toLowerCase()
      allDocs = allDocs.filter(doc =>
        doc.customerName.toLowerCase().includes(qLower) ||
        doc.docNumber.toLowerCase().includes(qLower) ||
        (doc.zohoId && doc.zohoId.toLowerCase().includes(qLower)) ||
        JSON.stringify(doc.items || {}).toLowerCase().includes(qLower)
      )
    }

    allDocs.sort((a, b) => {
      let valA: any = a[sort as keyof UnifiedDoc]
      let valB: any = b[sort as keyof UnifiedDoc]

      if (sort === 'date') {
        valA = new Date(a.date).getTime()
        valB = new Date(b.date).getTime()
      } else if (sort === 'amount') {
        valA = a.amount
        valB = b.amount
      } else if (sort === 'number') {
        valA = a.docNumber
        valB = b.docNumber
      } else if (sort === 'customer') {
        valA = a.customerName
        valB = b.customerName
      } else if (sort === 'status') {
        valA = a.status
        valB = b.status
      }

      if (valA < valB) return dir === 'asc' ? -1 : 1
      if (valA > valB) return dir === 'asc' ? 1 : -1
      return 0
    })

    const total = allDocs.length
    const totalPages = Math.ceil(total / limitNum)
    const paginatedDocs = allDocs.slice(skip, skip + limitNum)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        docs: paginatedDocs,
        total,
        page: pageNum,
        totalPages,
      }),
    }
  } catch (error: any) {
    console.error('Error fetching docs:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message }),
    }
  }
}
