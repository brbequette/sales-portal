import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BOOKS_BASE = `https://www.zohoapis.${ZOHO_DC}/books/v3`

interface SyncStats {
  synced: number
  skipped: number
  apiCalls: number
  errors: string[]
  durationMs: number
}

/**
 * Sync a single entity type from Zoho Books.
 * Call separately for each: 'invoices', 'salesorders', 'estimates'
 * This keeps each call fast enough for serverless timeouts.
 */
export async function bulkSyncEntity(entity: string): Promise<SyncStats> {
  const token = await getZohoAccessToken()
  const startTime = Date.now()
  const stats: SyncStats = { synced: 0, skipped: 0, apiCalls: 0, errors: [], durationMs: 0 }

  // Build name-to-accountId map (1 DB query, no API calls)
  const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } })
  const nameMap = new Map<string, string>()
  allAccounts.forEach(a => nameMap.set(a.name.toLowerCase().trim(), a.id))

  const headers = { Authorization: `Zoho-oauthtoken ${token}` }

  // Fetch all pages from a Books endpoint
  async function fetchAllPages(endpoint: string, arrayKey: string): Promise<any[]> {
    const records: any[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const url = `${BOOKS_BASE}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200&sort_column=date&sort_order=D`

      const res = await fetch(url, { headers })
      stats.apiCalls++

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown')
        console.error(`Books API error ${res.status} for ${endpoint} page ${page}: ${errorText.substring(0, 200)}`)
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Auth failed (${res.status}) — check Zoho credentials`)
        }
        if (res.status === 429) {
          console.log('Rate limited, waiting 30s...')
          await new Promise(r => setTimeout(r, 30000))
          continue
        }
        break
      }

      // Guard against HTML responses
      const contentType = res.headers.get('content-type') || ''
      const rawText = await res.text()
      
      if (!contentType.includes('json') && rawText.trim().startsWith('<')) {
        console.error(`HTML response for ${endpoint} page ${page}: ${rawText.substring(0, 200)}`)
        throw new Error(`Zoho returned HTML instead of JSON for ${endpoint}. This usually means the auth token is invalid.`)
      }

      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        throw new Error(`Invalid JSON from Zoho for ${endpoint} page ${page}: ${rawText.substring(0, 100)}`)
      }

      if (data.code !== undefined && data.code !== 0) {
        console.error(`Zoho error for ${endpoint}: ${data.message || JSON.stringify(data)}`)
        throw new Error(`Zoho API error: ${data.message || 'Unknown error'}`)
      }

      const items = data[arrayKey] || []
      if (items.length === 0) break

      records.push(...items)
      hasMore = data.page_context?.has_more_page || false
      page++

      if (page > 100) break // Safety cap
    }

    return records
  }

  try {
    if (entity === 'invoices') {
      console.log("Bulk sync: Fetching invoices from Zoho Books...")
      const invoices = await fetchAllPages('invoices', 'invoices')
      console.log(`Fetched ${invoices.length} invoices in ${stats.apiCalls} API calls`)

      const ops = []
      for (const inv of invoices) {
        const custName = (inv.customer_name || '').toLowerCase().trim()
        const dbAccountId = nameMap.get(custName)
        if (!dbAccountId || !inv.invoice_id) { stats.skipped++; continue }

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

      for (let i = 0; i < ops.length; i += 50) {
        await prisma.$transaction(ops.slice(i, i + 50))
        stats.synced += Math.min(50, ops.length - i)
      }

    } else if (entity === 'salesorders') {
      console.log("Bulk sync: Fetching sales orders from Zoho Books...")
      const salesOrders = await fetchAllPages('salesorders', 'salesorders')
      console.log(`Fetched ${salesOrders.length} sales orders in ${stats.apiCalls} API calls`)

      const ops = []
      for (const so of salesOrders) {
        const custName = (so.customer_name || '').toLowerCase().trim()
        const dbAccountId = nameMap.get(custName)
        if (!dbAccountId || !so.salesorder_id) { stats.skipped++; continue }

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
        stats.synced += Math.min(50, ops.length - i)
      }

    } else if (entity === 'estimates') {
      console.log("Bulk sync: Fetching estimates (quotes) from Zoho Books...")
      const estimates = await fetchAllPages('estimates', 'estimates')
      console.log(`Fetched ${estimates.length} estimates in ${stats.apiCalls} API calls`)

      const ops = []
      for (const est of estimates) {
        const custName = (est.customer_name || '').toLowerCase().trim()
        const dbAccountId = nameMap.get(custName)
        if (!dbAccountId || !est.estimate_id) { stats.skipped++; continue }

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
        stats.synced += Math.min(50, ops.length - i)
      }

    } else {
      throw new Error(`Unknown entity: ${entity}. Use 'invoices', 'salesorders', or 'estimates'.`)
    }
  } catch (err: any) {
    stats.errors.push(err.message)
    console.error(`Bulk sync ${entity} error:`, err)
  }

  stats.durationMs = Date.now() - startTime
  console.log(`Bulk sync ${entity} complete in ${(stats.durationMs / 1000).toFixed(1)}s — ${stats.apiCalls} API calls, ${stats.synced} synced, ${stats.skipped} skipped`)
  return stats
}
