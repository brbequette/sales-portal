import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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
    const page = searchParams.get('page') || '1'
    const limit = searchParams.get('limit') || '50'
    const callerDbId = searchParams.get('callerDbId')
    const callerRole = searchParams.get('callerRole')

    const pageNum  = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50))
    const offset   = (pageNum - 1) * limitNum

    const isAdmin = !!(callerRole?.toLowerCase().includes('admin') || callerRole?.toLowerCase().includes('manager'))

    // ── Sort column mapping ──
    const sortColMap: Record<string, string> = {
      date:     'doc_date',
      amount:   'd.amount',
      number:   'doc_number',
      customer: 'account_name',
      status:   'd.status',
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
      const numField  = { invoice: "i.items->>'invoiceNumber'", quote: "i.items->>'estimateNumber'", salesorder: "i.items->>'salesOrderNumber'" }
      const table     = tableMap[docType]
      const dateExpr  = dateCol[docType]
      const numExpr   = numField[docType]

      const conditions: Prisma.Sql[] = [Prisma.sql`i."accountId" IS NOT NULL`]

      // Status filter
      if (status) conditions.push(Prisma.sql`LOWER(i.status) = LOWER(${status})`)

      // Date range
      if (dateFrom) conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} >= ${new Date(dateFrom)}`)
      if (dateTo)   conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} <= ${new Date(dateTo)}`)

      // Amount range
      if (amountMin) conditions.push(Prisma.sql`i.amount >= ${parseFloat(amountMin)}`)
      if (amountMax) conditions.push(Prisma.sql`i.amount <= ${parseFloat(amountMax)}`)

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
      if (!isAdmin && callerDbId) {
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
          COALESCE(${Prisma.raw(numExpr)}, i.id::text)                       AS doc_number,
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

    const countResult = await prisma.$queryRaw<[{ total: bigint }]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM (${unionForCount}) AS _c`
    )
    const total = Number(countResult[0]?.total ?? 0)

    // ── Data query with sort + pagination ──
    const unionForData = typeBlocks.length === 1
      ? typeBlocks[0]
      : Prisma.sql`${Prisma.join(typeBlocks, ' UNION ALL ')}`

    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`
        SELECT * FROM (${unionForData}) AS docs
        ORDER BY ${Prisma.raw(sortCol)} ${Prisma.raw(sortDir)}
        LIMIT ${limitNum} OFFSET ${offset}
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
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    })
  } catch (error: any) {
    console.error('search-docs error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
