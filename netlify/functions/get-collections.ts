import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { syncRecentBooksInvoices } from "./lib/zoho-books"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { tab = "overdue", repId, refresh, zohoId, email } = event.queryStringParameters || {}
    const now = new Date()

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
          // Only sync invoice statuses from Books — the heavy CRM account sync is handled by get-accounts
          console.log('Collections: syncing recent invoice statuses from Zoho Books...')
          await syncRecentBooksInvoices()
          console.log('Collections: Books invoice status sync complete.')

          // Record successful sync timestamp for cooldown
          await prisma.systemSetting.upsert({
            where: { key: COOLDOWN_KEY },
            update: { value: new Date().toISOString() },
            create: { key: COOLDOWN_KEY, value: new Date().toISOString() }
          })
        } catch (zohoError) {
          console.error("Failed to sync with Zoho Books from collections page:", zohoError)
        }
      } // end cooldown else
    }

    let invoices: any[]

    if (tab === "all") {
      // All Outstanding: unpaid status
      invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] }
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    } else if (tab === "overdue") {
      // Overdue: status contains "Overdue" OR (not Paid and past due date)
      invoices = await prisma.invoice.findMany({
        where: {
          AND: [
            { status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] } },
            {
              OR: [
                // Explicit Overdue status
                { status: { contains: "Overdue", mode: "insensitive" } },
                // Past due with unpaid status
                {
                  dueDate: { lt: now },
                },
              ]
            }
          ]
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    } else {
      // Current: unpaid and not overdue
      invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] },
          AND: [
            {
              NOT: {
                status: { contains: "Overdue", mode: "insensitive" }
              }
            },
            {
              OR: [
                { dueDate: { gte: now } },
                { dueDate: null },
              ]
            }
          ]
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    }

    // Filter by rep
    if (repId) {
      invoices = invoices.filter(inv => inv.account?.ownerId === repId)
    }

    const daysOverdue = (dueDate: Date | null) => {
      if (!dueDate) return 0
      return Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000))
    }

    const formatted = invoices.map(inv => {
      const items = inv.items as any
      const salespersonVal = items?.salesperson || inv.account?.owner?.name || "Unassigned"
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoice_id: inv.zohoId,
        invoice_number: items?.invoiceNumber || items?.invoice_number || inv.zohoId?.slice(-6) || "—",
        customer_name: inv.account?.name || "Unknown",
        customer_id: inv.account?.zohoId || inv.accountId,
        salesperson_name: salespersonVal,
        salesperson_id: inv.account?.owner?.id,
        salesperson_zoho_id: inv.account?.owner?.zohoId || null,
        salesperson_email: inv.account?.owner?.email || null,
        account_owner_name: inv.account?.owner?.name || "Unassigned",
        account_owner_id: inv.account?.owner?.id || null,
        account_owner_zoho_id: inv.account?.owner?.zohoId || null,
        account_owner_email: inv.account?.owner?.email || null,
        due_date: inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : null,
        issue_date: inv.issueDate ? inv.issueDate.toISOString().split("T")[0] : null,
        balance: inv.amount,
        total: inv.amount,
        status: inv.status,
        days_overdue: daysOverdue(inv.dueDate),
        books_invoice_id: items?.booksInvoiceId || null,
        profit: items?.profit || 0,
        dead_cost: items?.deadCostTotal || 0,
        customer_city: inv.account?.billingCity || null,
        customer_state: inv.account?.billingState || null,
        shipping_charge: items?.shippingCharge ?? null,
        account_quality: inv.account?.quality || null,
      }
    })

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
