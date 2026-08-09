import { Handler } from '@netlify/functions'
import { prisma, Prisma } from './lib/prisma'

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

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

    const pageNum  = Math.max(1, parseInt(page  as string, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50))
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
    const sortCol = sortColMap[sort as string] || 'doc_date'
    const sortDir = (dir as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    // ── Build WHERE fragments ──────────────────────────────────────────────────
    // We build type-specific UNION queries so each doc type can use its own date column.

    type DocType = 'invoice' | 'quote' | 'salesorder'
    const types: DocType[] = (type === 'all')
      ? ['invoice', 'quote', 'salesorder']
      : [type as DocType]

    // Helper to build a single-type SQL block
    const buildTypeBlock = (docType: DocType) => {
      const tableMap  = { invoice: '"Invoice"', quote: '"Quote"', salesorder: '"SalesOrder"' }
      const dateCol   = { invoice: 'i."issueDate"', quote: 'i."createdAt"', salesorder: 'i."orderDate"' }
      const numField  = { invoice: "i.items->>'invoiceNumber'", quote: "i.items->>'estimateNumber'", salesorder: "i.items->>'salesOrderNumber'" }
      const table     = tableMap[docType]
      const dateExpr  = dateCol[docType]
      const numExpr   = numField[docType]

      const conditions: Prisma.Sql[] = [Prisma.sql`i."accountId" IS NOT NULL`]

      // Status filter
      if (status) conditions.push(Prisma.sql`LOWER(i.status) = LOWER(${status as string})`)

      // Date range
      if (dateFrom) conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} >= ${new Date(dateFrom as string)}`)
      if (dateTo)   conditions.push(Prisma.sql`${Prisma.raw(dateExpr)} <= ${new Date(dateTo as string)}`)

      // Amount range
      if (amountMin) conditions.push(Prisma.sql`i.amount >= ${parseFloat(amountMin as string)}`)
      if (amountMax) conditions.push(Prisma.sql`i.amount <= ${parseFloat(amountMax as string)}`)

      // Text search — across customer name, doc number, status
      if (q) {
        const pattern = `%${(q as string).toLowerCase()}%`
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
          a."ownerId" = ${callerDbId as string}
          OR u.id = ${callerDbId as string}
          OR u."zohoId" = ${callerDbId as string}
        )`)
      } else if (isAdmin && repId) {
        conditions.push(Prisma.sql`(
          a."ownerId" = ${repId as string}
          OR u.id = ${repId as string}
          OR u."zohoId" = ${repId as string}
          OR LOWER(COALESCE(u.name, '')) LIKE ${`%${(repId as string).toLowerCase()}%`}
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
          COALESCE(i.status, 'Draft')                                        AS status
        FROM ${Prisma.raw(table)} i
        LEFT JOIN "Account" a ON a.id = i."accountId"
        LEFT JOIN "User"    u ON u.id = a."ownerId"
        WHERE ${whereClause}
      `
    }

    const typeBlocks = types.map(buildTypeBlock)

    // ── Count query ───────────────────────────────────────────────────────────
    const unionForCount = typeBlocks.length === 1
      ? typeBlocks[0]
      : Prisma.sql`${Prisma.join(typeBlocks, ' UNION ALL ')}`

    const countResult = await prisma.$queryRaw<[{ total: bigint }]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM (${unionForCount}) AS _c`
    )
    const total = Number(countResult[0]?.total ?? 0)

    // ── Data query with sort + pagination ────────────────────────────────────
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
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        docs,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      }),
    }
  } catch (error: any) {
    console.error('search-docs error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message }),
    }
  }
}
