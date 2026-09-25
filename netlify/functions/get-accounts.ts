import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma, Prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"


const authenticatedHandler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    let { zohoId, email, ownerIdFilter, statusFilter, page: pageParam, limit: limitParam, search, includeDocs, includeHidden, checkOnly } = event.queryStringParameters || {}

  // Load admin email aliases from SystemSettings (key: 'admin_email_aliases', comma-separated)
  let adminEmailAliases: Record<string, string> = {}
  let adminEmailPatterns: string[] = []
  try {
    const [aliasRow, patternRow] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'admin_email_aliases' } }),
      prisma.systemSetting.findUnique({ where: { key: 'admin_email_patterns' } })
    ])
    if (aliasRow?.value) adminEmailAliases = JSON.parse(aliasRow.value)
    if (patternRow?.value) adminEmailPatterns = patternRow.value.split(',').map(s => s.trim().toLowerCase())
  } catch { /* use defaults below */ }

  // Apply email alias (e.g. admin@ → primary email) from DB settings
  if (email && adminEmailAliases[email.toLowerCase()]) {
    email = adminEmailAliases[email.toLowerCase()]
  }
    const wantDocs = includeDocs === 'true'
    const parsedLimit = parseInt(limitParam || '200', 10)
    const PAGE_SIZE = isNaN(parsedLimit) || parsedLimit <= 0 ? 200 : Math.min(parsedLimit, 500)
    const page = parseInt(pageParam || '1', 10)
    const auth = await authenticateFunction(event)
    const sessionUser = await prisma.user.findFirst({
      where: {
        OR: [
          auth.dbId ? { id: auth.dbId } : undefined,
          auth.userId ? { id: auth.userId } : undefined,
          auth.email ? { email: { equals: auth.email, mode: 'insensitive' } } : undefined,
        ].filter(Boolean) as any,
      },
    })

    if (!sessionUser) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, message: 'Signed-in user is not linked to a local user record' }),
      }
    }

    const sessionEmailLower = (sessionUser.email || auth.email || '').toLowerCase()
    const sessionIsAdmin = isAdminRole(sessionUser.role)
      || (adminEmailPatterns.length > 0 && adminEmailPatterns.some(pattern => sessionEmailLower.includes(pattern)))

    // Query parameters may narrow an administrator to a rep for impersonation,
    // but they can never elevate a signed-in rep or select another rep's data.
    let user = sessionUser
    if (sessionIsAdmin && (zohoId || (email && email.toLowerCase() !== sessionEmailLower))) {
      const requestedUser = await prisma.user.findFirst({
        where: {
          OR: [
            zohoId ? { id: zohoId } : undefined,
            zohoId ? { zohoId } : undefined,
            email ? { email: { equals: email, mode: 'insensitive' } } : undefined,
          ].filter(Boolean) as any,
        },
      })
      if (requestedUser) user = requestedUser
    }

    const isAdmin = sessionIsAdmin && user.id === sessionUser.id
    const isSalesOnly = !isAdmin
    const showHidden = isAdmin && includeHidden === 'true'

    // ── checkOnly mode: single fast DB query, no data returned ────────────
    // Used by the frontend to silently check if new data is available.
    // Returns: { hasUpdates: bool, count: number, latestUpdatedAt: string }
    if (checkOnly === 'true') {
      const where = isSalesOnly && user ? { ownerId: user.id } : {}
      const [count, latest] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findFirst({ where, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          success: true,
          checkOnly: true,
          count,
          latestUpdatedAt: latest?.updatedAt ?? null,
        })
      }
    }

    // Page refreshes always re-query PostgreSQL. Provider imports and sync are
    // available only through separately authorized mutation endpoints.
    // PERF: single $queryRaw does all SUM/COUNT/json_agg in PostgreSQL.
    // Static status exclusion list is embedded as a literal SQL string (safe — not user input).
    // Parameterized values (owner IDs, search, status) use Prisma.sql interpolation.

    // Build scope filter
    let scopeSql: Prisma.Sql = Prisma.empty
    if (isSalesOnly && user) {
      const ownerIds = [user.id, user.zohoId, user.email].filter(Boolean) as string[]
      scopeSql = Prisma.sql`AND a."ownerId" = ANY(ARRAY[${Prisma.join(ownerIds)}]::text[])`
    } else if (ownerIdFilter && ownerIdFilter !== 'all' && ownerIdFilter !== 'All' && !ownerIdFilter.toLowerCase().includes('myself')) {
      const matchingUsers = await prisma.user.findMany({ take: 500, 
        where: {
          OR: [
            { id: ownerIdFilter },
            { zohoId: ownerIdFilter },
            { email: { equals: ownerIdFilter, mode: 'insensitive' } },
            { name: { contains: ownerIdFilter, mode: 'insensitive' } }
          ]
        }
      })
      if (matchingUsers.length > 0) {
        const ids = matchingUsers.flatMap((u: any) => [u.id, u.zohoId, u.email].filter(Boolean)) as string[]
        scopeSql = Prisma.sql`AND a."ownerId" = ANY(ARRAY[${Prisma.join(ids)}]::text[])`
      }
    }

    const statusSql: Prisma.Sql = statusFilter
      ? Prisma.sql`AND a.status = ${statusFilter}`
      : Prisma.sql`AND COALESCE(a.status, '') NOT IN ('Inactive','Do Not Contact','DNR')`

    const searchSql: Prisma.Sql = search
      ? Prisma.sql`AND a.name ILIKE ${'%' + search + '%'}`
      : Prisma.empty

    // Static exclusion list embedded as SQL literal — never comes from user input
    const EXCL_SQL = `'Void','void','Voided','voided','Draft','draft','Writeoff','Write_off','Write Off','Bad Debt','writeoff','write_off','write off','bad debt'`

    // Fast count for pagination
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Account" a WHERE 1=1 ${scopeSql} ${statusSql} ${searchSql}`
    )
    const totalCount = Number(countResult[0]?.count ?? 0)

    // Page accounts before joining invoice history. Previously PostgreSQL had to
    // aggregate every matching account and only then apply LIMIT/OFFSET.
    const dbAccounts: any[] = await prisma.$queryRaw<any[]>(Prisma.sql`
      WITH paged_accounts AS MATERIALIZED (
        SELECT a.*
        FROM "Account" a
        WHERE 1=1 ${scopeSql} ${statusSql} ${searchSql}
        ORDER BY a.name ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      )
      SELECT
        a.id::text, a."zohoId", a."crmAccountId", a."booksCustomerId", a.name, a.tags, a.status, a.quality,
        a."lastCalledAt", a."lastPurchaseAt", a."ownerId", a."updatedAt", a.industry, a."timeZone",
        a."billingStreet", a."billingCity", a."billingState", a."billingZip",
        a."shippingStreet", a."shippingCity", a."shippingState", a."shippingZip",
        a."bladeSizes", a."materialsCut", a."currentSupplier", a."averageBladeCost",
        a."crewCount", a."bladesPerOrder", a."improvementPriority",
        u.id::text AS "ownerId_u", u.name AS "ownerName", u.email AS "ownerEmail", u.role AS "ownerRole",
        -- totalSales: sum of all non-excluded invoice amounts
        COALESCE(SUM(i.amount) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ), 0)::float AS "totalSales",
        -- totalProfit: prefer computed column, fall back to items JSON
        COALESCE(SUM(COALESCE(i."computedProfit", (i.items->>'profit')::float)) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ), 0)::float AS "totalProfit",
        -- overdue
        COALESCE(SUM(COALESCE(i.balance, i.amount)) FILTER (
          WHERE i.status ILIKE '%overdue%'
        ), 0)::float AS "overdueBalance",
        COALESCE(COUNT(i.id) FILTER (
          WHERE i.status ILIKE '%overdue%'
        ), 0)::int AS "overdueCount",
        -- unpaid (open balance > 0, not paid/excluded)
        COALESCE(SUM(COALESCE(i.balance, i.amount)) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), 0)::float AS "unpaidBalance",
        COALESCE(COUNT(i.id) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), 0)::int AS "unpaidCount",
        -- latest invoice date for lastPurchaseAt fallback
        MAX(i."issueDate") FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ) AS "latestInvoiceDate",
        -- lightweight unpaid invoice list (no items blob)
        COALESCE(json_agg(json_build_object(
          'invoiceNumber', COALESCE(i."computedInvoiceNumber", i.items->>'invoiceNumber', i.items->>'invoice_number', i."zohoId"),
          'dueDate',       i."dueDate",
          'balance',       COALESCE(i.balance, i.amount),
          'status',        i.status,
          'amount',        i.amount
        )) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), '[]'::json) AS "unpaidInvoiceSummary",
        -- Contacts are local-first data used by search and the expandable drawer.
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', c2.id,
            'zohoId', c2."zohoId",
            'firstName', c2."firstName",
            'lastName', c2."lastName",
            'email', c2.email,
            'phone', c2.phone,
            'mobilePhone', c2."mobilePhone",
            'isPrimary', c2."isPrimary",
            'designation', c2.designation,
            'mailingStreet', c2."mailingStreet",
            'mailingCity', c2."mailingCity",
            'mailingState', c2."mailingState",
            'mailingZip', c2."mailingZip"
          ) ORDER BY c2."isPrimary" DESC, c2."lastName", c2."firstName")
          FROM "Contact" c2
          WHERE c2."accountId" = a.id
        ), '[]'::json) AS contacts,
        -- Distinct invoiced products power the product-history filter without
        -- fetching documents or parsing Zoho JSON in the browser.
        COALESCE((
          SELECT json_agg(json_build_object('name', products."productName", 'sku', products.sku))
          FROM (
            SELECT li."productName", li.sku
            FROM "LineItem" li
            JOIN "Invoice" product_invoice ON product_invoice.id = li."invoiceId"
            WHERE product_invoice."accountId" = a.id
              AND product_invoice.status NOT IN (${Prisma.raw(EXCL_SQL)})
            GROUP BY li."productName", li.sku
            ORDER BY li."productName", li.sku
          ) products
        ), '[]'::json) AS "boughtProducts"
      FROM paged_accounts a
      LEFT JOIN "User" u ON u.id = a."ownerId"
      LEFT JOIN "Invoice" i ON i."accountId" = a.id
      WHERE 1=1 ${scopeSql} ${statusSql} ${searchSql}
      GROUP BY
        a.id, a."zohoId", a."crmAccountId", a."booksCustomerId", a.name, a.tags, a.status, a.quality,
        a."lastCalledAt", a."lastPurchaseAt", a."ownerId", a."updatedAt", a.industry, a."timeZone",
        a."billingStreet", a."billingCity", a."billingState", a."billingZip",
        a."shippingStreet", a."shippingCity", a."shippingState", a."shippingZip",
        a."bladeSizes", a."materialsCut", a."currentSupplier", a."averageBladeCost",
        a."crewCount", a."bladesPerOrder", a."improvementPriority",
        u.id, u.name, u.email, u.role
      ORDER BY a.name ASC
    `)

    // Map flat rows → response shape, no JS aggregation loops
    const accounts = dbAccounts.map((acc: any) => ({
      id: acc.id,
      zohoId: acc.zohoId,
      crmAccountId: acc.crmAccountId,
      booksCustomerId: acc.booksCustomerId,
      name: acc.name,
      tags: acc.tags,
      status: acc.status,
      quality: acc.quality,
      lastCalledAt: acc.lastCalledAt,
      lastPurchaseAt: acc.lastPurchaseAt || acc.latestInvoiceDate,
      ownerId: acc.ownerId,
      updatedAt: acc.updatedAt,
      industry: acc.industry,
      timeZone: acc.timeZone,
      billingStreet: acc.billingStreet, billingCity: acc.billingCity,
      billingState: acc.billingState,   billingZip: acc.billingZip,
      shippingStreet: acc.shippingStreet, shippingCity: acc.shippingCity,
      shippingState: acc.shippingState,   shippingZip: acc.shippingZip,
      bladeSizes: acc.bladeSizes, materialsCut: acc.materialsCut,
      currentSupplier: acc.currentSupplier, averageBladeCost: acc.averageBladeCost,
      crewCount: acc.crewCount, bladesPerOrder: acc.bladesPerOrder,
      improvementPriority: acc.improvementPriority,
      owner: acc.ownerName ? { id: acc.ownerId_u, name: acc.ownerName, email: acc.ownerEmail, role: acc.ownerRole } : null,
      totalSales:           parseFloat(acc.totalSales)    || 0,
      totalProfit:          parseFloat(acc.totalProfit)   || 0,
      overdueBalance:       parseFloat(acc.overdueBalance)|| 0,
      overdueCount:         parseInt(acc.overdueCount)    || 0,
      unpaidBalance:        parseFloat(acc.unpaidBalance) || 0,
      unpaidCount:          parseInt(acc.unpaidCount)     || 0,
      unpaidInvoiceSummary: Array.isArray(acc.unpaidInvoiceSummary) ? acc.unpaidInvoiceSummary : [],
      boughtProducts: Array.isArray(acc.boughtProducts) ? acc.boughtProducts : [],
      purchasedProductNames: Array.isArray(acc.boughtProducts)
        ? acc.boughtProducts.map((product: any) => product.name).filter(Boolean)
        : [],
      contacts: Array.isArray(acc.contacts) ? acc.contacts : [],
      _count: { invoices: parseInt(acc.unpaidCount) || 0, quotes: 0, salesOrders: 0 },
    }))


    // Query list of reps for admin dropdown population
    let reps: any[] = [];
    if (isAdmin) {
      reps = await prisma.user.findMany({ take: 500, 
        select: {
          id: true,
          name: true,
          email: true,
          zohoId: true,
          role: true,
        },
        orderBy: { name: "asc" }
      });
      
      const visibleRepsSetting = await prisma.systemSetting.findUnique({ where: { key: "visible_reps" } });
      const visibleReps: string[] = JSON.parse(visibleRepsSetting?.value || "[]");
      if (!showHidden && visibleReps.length > 0) {
        reps = reps.filter(r => visibleReps.includes(r.id));
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        accounts,
        reps,
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          totalCount,
          hasMore: page * PAGE_SIZE < totalCount
        }
      })
    }

  } catch (error: any) {
    console.error("Get Accounts Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
