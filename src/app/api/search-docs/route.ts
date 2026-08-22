import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getAuthenticatedDbUser } from '@/lib/session-user'

const getStoredDocumentUrl = (items: unknown): string | null => {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return null

  const record = items as Record<string, unknown>
  const candidates = [
    record.invoice_url,
    record.estimate_url,
    record.quote_url,
    record.salesorder_url,
    record.sales_order_url,
    record.document_url,
    record.permalink,
    record.url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue

    try {
      const url = new URL(candidate)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
    } catch {}
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedDbUser()
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'
    const status = searchParams.get('status')
    const repId = searchParams.get('repId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const amountMin = searchParams.get('amountMin')
    const amountMax = searchParams.get('amountMax')
    const q = searchParams.get('q')
    const sort = searchParams.get('sort') || 'date'
    const dir = searchParams.get('dir') || 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50))
    const callerDbId = actor.user.id
    const offset   = (page - 1) * pageSize

    const isAdmin = actor.isAdmin

    const allowedTypes = new Set(['all', 'invoice', 'quote', 'salesorder'])
    if (!allowedTypes.has(type)) {
      return NextResponse.json({ success: false, error: 'Invalid document type' }, { status: 400 })
    }

    const parsedDateFrom = dateFrom ? new Date(dateFrom) : null
    const parsedDateTo = dateTo ? new Date(dateTo) : null
    if ((parsedDateFrom && Number.isNaN(parsedDateFrom.getTime())) || (parsedDateTo && Number.isNaN(parsedDateTo.getTime()))) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 })
    }
    if (parsedDateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo || '')) {
      parsedDateTo.setUTCHours(23, 59, 59, 999)
    }

    const parsedAmountMin = amountMin === null ? null : Number(amountMin)
    const parsedAmountMax = amountMax === null ? null : Number(amountMax)
    if ((parsedAmountMin !== null && !Number.isFinite(parsedAmountMin)) || (parsedAmountMax !== null && !Number.isFinite(parsedAmountMax))) {
      return NextResponse.json({ success: false, error: 'Invalid amount range' }, { status: 400 })
    }

    // ── Sort column mapping ──
    const sortColMap: Record<string, string> = {
      date:     'doc_date',
      amount:   'amount',
      number:   'doc_number',
      customer: 'account_name',
      rep:      'rep_name',
      status:   'status',
    }
    const sortCol = sortColMap[sort] || 'doc_date'
    const sortDir = dir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    // ── Build WHERE fragments ──
    type DocType = 'invoice' | 'quote' | 'salesorder'
    const types: DocType[] = (type === 'all')
      ? ['invoice', 'quote', 'salesorder']
      : [type as DocType]

    const buildTypeBlock = (docType: DocType) => {
      const tableMap  = { invoice: '"Invoice"', quote: '"Quote"', salesorder: '"SalesOrder"' }
      const dateCol   = { invoice: 'i."issueDate"', quote: 'i."createdAt"', salesorder: 'i."orderDate"' }
      const numField  = {
        invoice: `COALESCE(i."computedInvoiceNumber", i."invoiceNumber", i.items->>'invoiceNumber', i.items->>'invoice_number')`,
        quote: `COALESCE(i.items->>'estimateNumber', i.items->>'estimate_number', i.items->>'quoteNumber', i.items->>'quote_number')`,
        salesorder: `COALESCE(i.items->>'salesOrderNumber', i.items->>'salesorder_number', i.items->>'sales_order_number')`,
      }
      const table     = tableMap[docType]
      const dateExpr  = dateCol[docType]
      const numExpr   = numField[docType]

      const conditions: Prisma.Sql[] = [Prisma.sql`i."accountId" IS NOT NULL`]

      // Status filter
      if (status) conditions.push(Prisma.sql`LOWER(i.status) = LOWER(${status})`)

      // Date range
      if (parsedDateFrom) conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} >= ${parsedDateFrom}`)
      if (parsedDateTo)   conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} <= ${parsedDateTo}`)

      // Amount range
      if (parsedAmountMin !== null) conditions.push(Prisma.sql`i.amount >= ${parsedAmountMin}`)
      if (parsedAmountMax !== null) conditions.push(Prisma.sql`i.amount <= ${parsedAmountMax}`)

      // Text search
      if (q) {
        const pattern = `%${q.toLowerCase()}%`
        conditions.push(Prisma.sql`(
          LOWER(a.name) LIKE ${pattern}
          OR LOWER(COALESCE(${Prisma.raw(numExpr)}, '')) LIKE ${pattern}
          OR LOWER(i.status) LIKE ${pattern}
          OR LOWER(COALESCE(u.name, '')) LIKE ${pattern}
        )`)
      }

      // Ownership / rep scoping
      if (!isAdmin) {
        conditions.push(Prisma.sql`(
          a."ownerId" = ${callerDbId}
          OR u.id = ${callerDbId}
          OR u."zohoId" = ${callerDbId}
        )`)
      } else if (isAdmin && repId) {
        conditions.push(Prisma.sql`(
          a."ownerId" = ${repId}
          OR u.id = ${repId}
          OR u."zohoId" = ${repId}
          OR LOWER(COALESCE(u.name, '')) LIKE ${`%${repId.toLowerCase()}%`}
        )`)
      }

      const whereClause = Prisma.sql`${Prisma.join(conditions, ' AND ')}`

      return Prisma.sql`
        SELECT
          i.id::text                                                         AS id,
          i."zohoId"                                                         AS "zohoId",
          ${docType}                                                         AS type,
          COALESCE(${Prisma.raw(numExpr)}, i."zohoId", i.id::text)         AS doc_number,
          COALESCE(a.name, 'Unknown Customer')                               AS account_name,
          COALESCE(u.name, 'Unknown Rep')                                    AS rep_name,
          COALESCE(${Prisma.raw(dateExpr)}, i."createdAt")                   AS doc_date,
          COALESCE(i.amount, 0)                                              AS amount,
          COALESCE(i.status, 'Draft')                                        AS status,
          i.items                                                            AS items
        FROM ${Prisma.raw(table)} i
        LEFT JOIN "Account" a ON a.id = i."accountId"
        LEFT JOIN "User"    u ON u.id = a."ownerId"
        WHERE ${whereClause}
      `
    }

    const typeBlocks = types.map(buildTypeBlock)

    // ── Count query ──
    const unionForCount = typeBlocks.length === 1
      ? typeBlocks[0]
      : Prisma.sql`${Prisma.join(typeBlocks, ' UNION ALL ')}`

    const [aggregate] = await prisma.$queryRaw<Array<{
      total: bigint
      invoices: bigint
      quotes: bigint
      sales_orders: bigint
    }>>(Prisma.sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE type = 'invoice') AS invoices,
        COUNT(*) FILTER (WHERE type = 'quote') AS quotes,
        COUNT(*) FILTER (WHERE type = 'salesorder') AS sales_orders
      FROM (${unionForCount}) AS _counts
    `)
    const total = Number(aggregate?.total ?? 0)
    const stats = {
      invoices: Number(aggregate?.invoices ?? 0),
      quotes: Number(aggregate?.quotes ?? 0),
      salesOrders: Number(aggregate?.sales_orders ?? 0),
    }

    // ── Data query with sort + pagination ──
    const unionForData = typeBlocks.length === 1
      ? typeBlocks[0]
      : Prisma.sql`${Prisma.join(typeBlocks, ' UNION ALL ')}`

    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`
        SELECT * FROM (${unionForData}) AS docs
        ORDER BY ${Prisma.raw(sortCol)} ${Prisma.raw(sortDir)}
        LIMIT ${pageSize} OFFSET ${offset}
      `
    )

    const docs = rows.map(r => ({
      id:           r.id,
      zohoId:       r.zohoId,
      type:         r.type,
      docNumber:    r.doc_number || r.id?.slice(0, 8),
      customerName: r.account_name,
      repName:      r.rep_name,
      date:         r.doc_date instanceof Date ? r.doc_date.toISOString() : String(r.doc_date ?? ''),
      amount:       Number(r.amount) || 0,
      status:       r.status,
      items:        r.items,
      documentUrl:  getStoredDocumentUrl(r.items),
    }))

    return NextResponse.json({
      success: true,
      docs,
      total,
      stats,
      page: page,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error: any) {
    console.error('search-docs error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
