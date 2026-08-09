import { Handler } from "@netlify/functions"
import { syncRecentBooksInvoices } from "./lib/zoho-books"
import { prisma, Prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { tab = "overdue", repId, refresh, zohoId, email, checkOnly } = event.queryStringParameters || {}
    const now = new Date()

    // ── checkOnly mode: returns count + latestUpdatedAt only ──────────────
    if (checkOnly === 'true') {
      const [count, latest] = await Promise.all([
        prisma.invoice.count({}),
        prisma.invoice.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, checkOnly: true, count, latestUpdatedAt: latest?.updatedAt ?? null })
      }
    }

    if (refresh === "true" && (zohoId || email)) {
      // --- 60-minute sync cooldown ---
      const COOLDOWN_KEY = 'collections_last_synced_at'
      const COOLDOWN_MS = 60 * 60 * 1000 // 60 minutes
      const lastSync = await prisma.systemSetting.findUnique({ where: { key: COOLDOWN_KEY } })
      const cooldownActive = lastSync && (Date.now() - new Date(lastSync.value).getTime() < COOLDOWN_MS)

      if (cooldownActive) {
        console.log('Collections sync skipped — cooldown active (last sync:', lastSync!.value, ')')
      } else {
        try {
          console.log('Collections: syncing recent invoice statuses from Zoho Books...')
          await syncRecentBooksInvoices()
          console.log('Collections: Books invoice status sync complete.')
          await prisma.systemSetting.upsert({
            where: { key: COOLDOWN_KEY },
            update: { value: new Date().toISOString() },
            create: { key: COOLDOWN_KEY, value: new Date().toISOString() }
          })
        } catch (zohoError) {
          console.error("Failed to sync with Zoho Books from collections page:", zohoError)
        }
      }
    }

    // PERF: $queryRaw replaces three separate findMany(include:{account:{include:{owner:true}}}) calls.
    // Selects only the 8 columns used in the response shape, joins Account+User in SQL,
    // and pushes repId filter into WHERE instead of post-filtering a full JS array.
    const EXCLUDED_STATUSES = ['Paid','Closed','Void','Voided','Draft','Writeoff','Write_off','Write Off','Bad Debt','paid','closed','void','voided','draft','writeoff','write_off','write off','bad debt']

    // NEW-007 fix: enforce rep-scoping for non-admins
    // The frontend always passes ?email=<currentUser.email>. We look up their role and,
    // if they are not an admin or manager, force the repId to their own user ID.
    let effectiveRepId = repId
    if (email) {
      const requestingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true }
      })
      if (requestingUser) {
        const roleLower = (requestingUser.role || '').toLowerCase()
        const isAdmin = roleLower.includes('admin') || roleLower.includes('manager')
        if (!isAdmin) {
          // Non-admin: force scope to their own data regardless of repId in URL
          effectiveRepId = requestingUser.id
        }
      }
    }

    const repFilterSql = effectiveRepId
      ? Prisma.sql`AND a."ownerId" = ${effectiveRepId}`
      : Prisma.empty

    let tabFilterSql: any
    if (tab === "all") {
      tabFilterSql = Prisma.sql`AND i.status NOT IN (${Prisma.join(EXCLUDED_STATUSES)})`
    } else if (tab === "overdue") {
      tabFilterSql = Prisma.sql`
        AND i.status NOT IN (${Prisma.join(EXCLUDED_STATUSES)})
        AND (
          i.status ILIKE '%overdue%'
          OR i."dueDate" < ${now}
        )`
    } else {
      // current: unpaid, not overdue, not past due
      tabFilterSql = Prisma.sql`
        AND i.status NOT IN (${Prisma.join(EXCLUDED_STATUSES)})
        AND i.status NOT ILIKE '%overdue%'
        AND (i."dueDate" >= ${now} OR i."dueDate" IS NULL)`
    }

    const invoices: any[] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        i.id::text,
        i."zohoId",
        i.amount,
        i.balance,
        i.status,
        i."issueDate",
        i."dueDate",
        i."createdAt",
        -- Account fields
        a.id::text        AS "accountId",
        a."zohoId"        AS "accountZohoId",
        a.name            AS "accountName",
        a."billingCity",
        a."billingState",
        a.quality         AS "accountQuality",
        -- Owner (salesperson) fields
        u.id::text        AS "ownerId",
        u.name            AS "ownerName",
        u.email           AS "ownerEmail",
        u."zohoId"        AS "ownerZohoId",
        -- Computed/fallback salesperson from items JSON
        COALESCE(i.items->>'salesperson', u.name) AS "salesperson",
        -- Only pull the minimal JSON fields we need
        jsonb_build_object(
          'invoiceNumber',   i.items->>'invoiceNumber',
          'invoice_number',  i.items->>'invoice_number',
          'booksInvoiceId',  i.items->>'booksInvoiceId',
          'profit',          i.items->>'profit',
          'deadCostTotal',   i.items->>'deadCostTotal',
          'shippingCharge',  i.items->>'shippingCharge'
        ) AS items
      FROM "Invoice" i
      JOIN "Account" a ON a.id = i."accountId"
      LEFT JOIN "User" u ON u.id = a."ownerId"
      WHERE 1=1
        ${tabFilterSql}
        ${repFilterSql}
      ORDER BY i."dueDate" ASC NULLS LAST
    `).catch(() => [])

    const daysOverdue = (dueDate: Date | null) => {
      if (!dueDate) return 0
      return Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000))
    }

    const formatted = invoices.map(inv => {
      const items = inv.items as any
      // PERF: fields now come from $queryRaw flat projection — no nested .account.owner chain
      const salespersonVal = inv.salesperson || inv.ownerName || "Unassigned"
      const dueDateVal  = inv.dueDate  ? new Date(inv.dueDate).toISOString().split("T")[0]  : null
      const issueDateVal = inv.issueDate ? new Date(inv.issueDate).toISOString().split("T")[0] : null
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoice_id: inv.zohoId,
        invoice_number: items?.invoiceNumber || items?.invoice_number || inv.zohoId?.slice(-6) || "—",
        customer_name: inv.accountName || "Unknown",
        customer_id: inv.accountZohoId || inv.accountId,
        salesperson_name: salespersonVal,
        salesperson_id: inv.ownerId,
        salesperson_zoho_id: inv.ownerZohoId || null,
        salesperson_email: inv.ownerEmail || null,
        account_owner_name: inv.ownerName || "Unassigned",
        account_owner_id: inv.ownerId || null,
        account_owner_zoho_id: inv.ownerZohoId || null,
        account_owner_email: inv.ownerEmail || null,
        due_date: dueDateVal,
        issue_date: issueDateVal,
        balance: inv.balance ?? inv.amount,  // BUG-008 fix: remaining balance, not full amount
        total: inv.amount,
        status: inv.status,
        days_overdue: daysOverdue(inv.dueDate ? new Date(inv.dueDate) : null),
        books_invoice_id: items?.booksInvoiceId || null,
        profit: parseFloat(items?.profit || 0) || 0,
        dead_cost: parseFloat(items?.deadCostTotal || 0) || 0,
        customer_city: inv.billingCity || null,
        customer_state: inv.billingState || null,
        shipping_charge: items?.shippingCharge ?? null,
        account_quality: inv.accountQuality || null,
      }
    })

    // totalBalance: sum of remaining balances (inv.balance ?? inv.amount) — correctly reflects partial payments
    const totalBalance = formatted.reduce((s, i) => s + (i.balance || 0), 0)
    const totalProfit = formatted.reduce((s, i) => s + (i.profit || 0), 0)
    const uniqueAccounts = new Set(formatted.map(i => i.customer_id)).size

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        invoices: formatted,
        count: formatted.length,
        totalBalance,
        totalProfit,
        uniqueAccounts,
        tab,
      }),
    }
  } catch (err: any) {
    console.error("get-collections error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message }),
    }
  }
}
