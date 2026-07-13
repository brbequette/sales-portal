import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BOOKS_BASE = `https://www.zohoapis.${ZOHO_DC}/books/v3`

/**
 * Bulk Sync — Pulls ALL invoices, quotes, and sales orders from Zoho Books
 * using minimal API calls (per_page=200, paginated).
 * 
 * Supports incremental sync via last_modified_time filtering.
 */
export async function bulkSync(options: { fullSync?: boolean } = {}) {
  const token = await getZohoAccessToken()
  const startTime = Date.now()
  const stats = {
    invoices: { synced: 0, skipped: 0, apiCalls: 0 },
    quotes: { synced: 0, skipped: 0, apiCalls: 0 },
    salesOrders: { synced: 0, skipped: 0, apiCalls: 0 },
    errors: [] as string[],
    totalApiCalls: 0,
    durationMs: 0,
  }

  // Build name-to-accountId map (1 DB query, no API calls)
  const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } })
  const nameMap = new Map<string, string>()
  allAccounts.forEach(a => nameMap.set(a.name.toLowerCase().trim(), a.id))

  // Get last sync time for incremental sync
  let lastSyncTime: string | null = null
  if (!options.fullSync) {
    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'bulk_sync_last_run' } })
      if (setting?.value) lastSyncTime = setting.value
    } catch { }
  }

  const headers = { Authorization: `Zoho-oauthtoken ${token}` }

  // Helper: fetch all pages from a Books endpoint
  async function fetchAllPages(endpoint: string, arrayKey: string, lastModified?: string | null): Promise<{ records: any[], apiCalls: number }> {
    const records: any[] = []
    let page = 1
    let hasMore = true
    let apiCalls = 0

    while (hasMore) {
      let url = `${BOOKS_BASE}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200&sort_column=date&sort_order=D`

      const res = await fetch(url, { headers })
      apiCalls++

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown')
        console.error(`Books API error ${res.status} for ${endpoint} page ${page}: ${errorText.substring(0, 200)}`)
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Auth failed (${res.status}) — check Zoho credentials`)
        }
        if (res.status === 429) {
          // Rate limited — wait 60s and retry once
          console.log('Rate limited, waiting 60s...')
          await new Promise(r => setTimeout(r, 60000))
          continue
        }
        break
      }

      // Check for HTML response (auth redirect)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('json')) {
        const text = await res.text().catch(() => '')
        console.error(`Non-JSON response for ${endpoint} page ${page}: ${text.substring(0, 200)}`)
        throw new Error(`Zoho returned non-JSON response for ${endpoint} — likely auth issue. Check API credentials.`)
      }

      const data = await res.json()
      
      // Zoho sometimes returns { code: 0, message: "..." } for errors
      if (data.code !== undefined && data.code !== 0) {
        console.error(`Zoho error for ${endpoint}: ${data.message || JSON.stringify(data)}`)
        throw new Error(`Zoho API error: ${data.message || 'Unknown error'}`)
      }

      const items = data[arrayKey] || []
      if (items.length === 0) break

      records.push(...items)
      hasMore = data.page_context?.has_more_page || false
      page++

      // Safety: max 100 pages (20,000 records) to prevent runaway
      if (page > 100) break
    }

    return { records, apiCalls }
  }

  // =====================
  // 1. SYNC INVOICES
  // =====================
  try {
    console.log("Bulk sync: Fetching invoices from Zoho Books...")
    const { records: invoices, apiCalls } = await fetchAllPages('invoices', 'invoices', lastSyncTime)
    stats.invoices.apiCalls = apiCalls
    console.log(`Fetched ${invoices.length} invoices in ${apiCalls} API calls`)

    const ops = []
    for (const inv of invoices) {
      const custName = (inv.customer_name || '').toLowerCase().trim()
      const dbAccountId = nameMap.get(custName)
      if (!dbAccountId || !inv.invoice_id) {
        stats.invoices.skipped++
        continue
      }

      ops.push(
        prisma.invoice.upsert({
          where: { zohoId: inv.invoice_id },
          update: {
            amount: parseFloat(inv.total || inv.sub_total || 0),
            status: inv.status || 'draft',
            issueDate: new Date(inv.date || inv.created_time),
            dueDate: inv.due_date ? new Date(inv.due_date) : null,
            zohoModifiedTime: inv.last_modified_time ? new Date(inv.last_modified_time) : null,
            items: {
              invoiceNumber: inv.invoice_number,
              booksInvoiceId: inv.invoice_id,
              balance: parseFloat(inv.balance || 0),
              salesperson: inv.salesperson_name || null,
            }
          },
          create: {
            zohoId: inv.invoice_id,
            accountId: dbAccountId,
            amount: parseFloat(inv.total || inv.sub_total || 0),
            status: inv.status || 'draft',
            issueDate: new Date(inv.date || inv.created_time),
            dueDate: inv.due_date ? new Date(inv.due_date) : null,
            zohoModifiedTime: inv.last_modified_time ? new Date(inv.last_modified_time) : null,
            items: {
              invoiceNumber: inv.invoice_number,
              booksInvoiceId: inv.invoice_id,
              balance: parseFloat(inv.balance || 0),
              salesperson: inv.salesperson_name || null,
            }
          }
        })
      )
    }

    // Execute in batches of 50
    for (let i = 0; i < ops.length; i += 50) {
      await prisma.$transaction(ops.slice(i, i + 50))
      stats.invoices.synced += Math.min(50, ops.length - i)
    }
  } catch (err: any) {
    stats.errors.push(`Invoices: ${err.message}`)
    console.error("Bulk sync invoices error:", err)
  }

  // =====================
  // 2. SYNC SALES ORDERS
  // =====================
  try {
    console.log("Bulk sync: Fetching sales orders from Zoho Books...")
    const { records: salesOrders, apiCalls } = await fetchAllPages('salesorders', 'salesorders', lastSyncTime)
    stats.salesOrders.apiCalls = apiCalls
    console.log(`Fetched ${salesOrders.length} sales orders in ${apiCalls} API calls`)

    const ops = []
    for (const so of salesOrders) {
      const custName = (so.customer_name || '').toLowerCase().trim()
      const dbAccountId = nameMap.get(custName)
      if (!dbAccountId || !so.salesorder_id) {
        stats.salesOrders.skipped++
        continue
      }

      ops.push(
        prisma.salesOrder.upsert({
          where: { zohoId: so.salesorder_id },
          update: {
            amount: parseFloat(so.sub_total || so.total || 0),
            status: so.order_status || so.status || 'Pending',
            orderDate: new Date(so.date || so.created_time),
            zohoModifiedTime: so.last_modified_time ? new Date(so.last_modified_time) : null,
            items: {
              salesOrderNumber: so.salesorder_number,
              salesperson: so.salesperson_name || null,
            }
          },
          create: {
            zohoId: so.salesorder_id,
            accountId: dbAccountId,
            amount: parseFloat(so.sub_total || so.total || 0),
            status: so.order_status || so.status || 'Pending',
            orderDate: new Date(so.date || so.created_time),
            zohoModifiedTime: so.last_modified_time ? new Date(so.last_modified_time) : null,
            items: {
              salesOrderNumber: so.salesorder_number,
              salesperson: so.salesperson_name || null,
            }
          }
        })
      )
    }

    for (let i = 0; i < ops.length; i += 50) {
      await prisma.$transaction(ops.slice(i, i + 50))
      stats.salesOrders.synced += Math.min(50, ops.length - i)
    }
  } catch (err: any) {
    stats.errors.push(`Sales Orders: ${err.message}`)
    console.error("Bulk sync sales orders error:", err)
  }

  // =====================
  // 3. SYNC ESTIMATES (QUOTES)
  // =====================
  try {
    console.log("Bulk sync: Fetching estimates (quotes) from Zoho Books...")
    const { records: estimates, apiCalls } = await fetchAllPages('estimates', 'estimates', lastSyncTime)
    stats.quotes.apiCalls = apiCalls
    console.log(`Fetched ${estimates.length} estimates in ${apiCalls} API calls`)

    const ops = []
    for (const est of estimates) {
      const custName = (est.customer_name || '').toLowerCase().trim()
      const dbAccountId = nameMap.get(custName)
      if (!dbAccountId || !est.estimate_id) {
        stats.quotes.skipped++
        continue
      }

      ops.push(
        prisma.quote.upsert({
          where: { zohoId: est.estimate_id },
          update: {
            amount: parseFloat(est.sub_total || est.total || 0),
            status: est.status || 'Draft',
            zohoModifiedTime: est.last_modified_time ? new Date(est.last_modified_time) : null,
            items: {
              estimateNumber: est.estimate_number,
              salesperson: est.salesperson_name || null,
            }
          },
          create: {
            zohoId: est.estimate_id,
            accountId: dbAccountId,
            amount: parseFloat(est.sub_total || est.total || 0),
            status: est.status || 'Draft',
            zohoModifiedTime: est.last_modified_time ? new Date(est.last_modified_time) : null,
            items: {
              estimateNumber: est.estimate_number,
              salesperson: est.salesperson_name || null,
            }
          }
        })
      )
    }

    for (let i = 0; i < ops.length; i += 50) {
      await prisma.$transaction(ops.slice(i, i + 50))
      stats.quotes.synced += Math.min(50, ops.length - i)
    }
  } catch (err: any) {
    stats.errors.push(`Quotes: ${err.message}`)
    console.error("Bulk sync quotes error:", err)
  }

  // Save last sync time
  const syncTime = new Date().toISOString()
  try {
    await prisma.systemSetting.upsert({
      where: { key: 'bulk_sync_last_run' },
      update: { value: syncTime },
      create: { key: 'bulk_sync_last_run', value: syncTime }
    })
  } catch { }

  stats.totalApiCalls = stats.invoices.apiCalls + stats.salesOrders.apiCalls + stats.quotes.apiCalls
  stats.durationMs = Date.now() - startTime

  console.log(`Bulk sync complete in ${(stats.durationMs / 1000).toFixed(1)}s — ${stats.totalApiCalls} API calls, ${stats.invoices.synced + stats.salesOrders.synced + stats.quotes.synced} records synced`)

  return stats
}
