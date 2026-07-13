import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
const BOOKS_BASE = `https://www.zohoapis.${ZOHO_DC}/books/v3`

interface PageSyncResult {
  synced: number
  skipped: number
  apiCalls: number
  page: number
  hasMore: boolean
  error?: string
  durationMs: number
}

/**
 * Sync ONE PAGE of a single entity from Zoho Books.
 * Returns hasMore=true if there are more pages to fetch.
 * The client should call repeatedly until hasMore=false.
 */
export async function bulkSyncPage(entity: string, page: number = 1): Promise<PageSyncResult> {
  const startTime = Date.now()
  const result: PageSyncResult = { synced: 0, skipped: 0, apiCalls: 0, page, hasMore: false, durationMs: 0 }

  try {
    const token = await getZohoAccessToken()
    const headers = { Authorization: `Zoho-oauthtoken ${token}` }

    // Build name-to-accountId map
    const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } })
    const nameMap = new Map<string, string>()
    allAccounts.forEach(a => nameMap.set(a.name.toLowerCase().trim(), a.id))

    // Determine endpoint and array key
    let endpoint: string, arrayKey: string
    if (entity === 'invoices') { endpoint = 'invoices'; arrayKey = 'invoices' }
    else if (entity === 'salesorders') { endpoint = 'salesorders'; arrayKey = 'salesorders' }
    else if (entity === 'estimates') { endpoint = 'estimates'; arrayKey = 'estimates' }
    else throw new Error(`Unknown entity: ${entity}`)

    // Fetch one page
    const url = `${BOOKS_BASE}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200&sort_column=date&sort_order=D`
    const res = await fetch(url, { headers })
    result.apiCalls = 1

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown')
      if (res.status === 401 || res.status === 403) {
        result.error = `Auth failed (${res.status}) — check Zoho credentials`
      } else if (res.status === 429) {
        result.error = 'Rate limited by Zoho — wait a minute and try again'
      } else {
        result.error = `Zoho API error ${res.status}: ${errorText.substring(0, 150)}`
      }
      result.durationMs = Date.now() - startTime
      return result
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith('<')) {
      result.error = 'Zoho returned HTML — auth token may be invalid. Try refreshing the page and syncing again.'
      result.durationMs = Date.now() - startTime
      return result
    }

    let data: any
    try { data = JSON.parse(rawText) } catch {
      result.error = `Invalid JSON from Zoho: ${rawText.substring(0, 100)}`
      result.durationMs = Date.now() - startTime
      return result
    }

    if (data.code !== undefined && data.code !== 0) {
      result.error = `Zoho error: ${data.message || 'Unknown'}`
      result.durationMs = Date.now() - startTime
      return result
    }

    const items = data[arrayKey] || []
    if (items.length === 0) {
      result.durationMs = Date.now() - startTime
      return result
    }

    result.hasMore = data.page_context?.has_more_page || false

    // Upsert records
    // Guard: Only accept records from the correct Zoho Books organization.
    // The main org generates IDs starting with '6821836'. Reject anything else
    // to prevent cross-org duplicates.
    const VALID_ORG_PREFIX = '6821836'

    const ops = []
    for (const item of items) {
      const custName = (item.customer_name || '').toLowerCase().trim()
      const dbAccountId = nameMap.get(custName)
      if (!dbAccountId) { result.skipped++; continue }

      // Validate the zohoId belongs to the correct org
      const itemId = item.invoice_id || item.salesorder_id || item.estimate_id || ''
      if (itemId && !itemId.startsWith(VALID_ORG_PREFIX)) {
        result.skipped++
        continue
      }

      if (entity === 'invoices') {
        if (!item.invoice_id) { result.skipped++; continue }
        ops.push(prisma.invoice.upsert({
          where: { zohoId: item.invoice_id },
          update: {
            amount: parseFloat(item.total || item.sub_total || 0),
            status: item.status || 'draft',
            issueDate: new Date(item.date || item.created_time),
            dueDate: item.due_date ? new Date(item.due_date) : null,
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: {
              invoiceNumber: item.invoice_number,
              booksInvoiceId: item.invoice_id,
              balance: parseFloat(item.balance || 0),
              salesperson: item.salesperson_name || null,
            }
          },
          create: {
            zohoId: item.invoice_id,
            accountId: dbAccountId,
            amount: parseFloat(item.total || item.sub_total || 0),
            status: item.status || 'draft',
            issueDate: new Date(item.date || item.created_time),
            dueDate: item.due_date ? new Date(item.due_date) : null,
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: {
              invoiceNumber: item.invoice_number,
              booksInvoiceId: item.invoice_id,
              balance: parseFloat(item.balance || 0),
              salesperson: item.salesperson_name || null,
            }
          }
        }))
      } else if (entity === 'salesorders') {
        if (!item.salesorder_id) { result.skipped++; continue }
        ops.push(prisma.salesOrder.upsert({
          where: { zohoId: item.salesorder_id },
          update: {
            amount: parseFloat(item.sub_total || item.total || 0),
            status: item.order_status || item.status || 'Pending',
            orderDate: new Date(item.date || item.created_time),
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: { salesOrderNumber: item.salesorder_number, salesperson: item.salesperson_name || null }
          },
          create: {
            zohoId: item.salesorder_id,
            accountId: dbAccountId,
            amount: parseFloat(item.sub_total || item.total || 0),
            status: item.order_status || item.status || 'Pending',
            orderDate: new Date(item.date || item.created_time),
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: { salesOrderNumber: item.salesorder_number, salesperson: item.salesperson_name || null }
          }
        }))
      } else if (entity === 'estimates') {
        if (!item.estimate_id) { result.skipped++; continue }
        ops.push(prisma.quote.upsert({
          where: { zohoId: item.estimate_id },
          update: {
            amount: parseFloat(item.sub_total || item.total || 0),
            status: item.status || 'Draft',
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: { estimateNumber: item.estimate_number, salesperson: item.salesperson_name || null }
          },
          create: {
            zohoId: item.estimate_id,
            accountId: dbAccountId,
            amount: parseFloat(item.sub_total || item.total || 0),
            status: item.status || 'Draft',
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: { estimateNumber: item.estimate_number, salesperson: item.salesperson_name || null }
          }
        }))
      }
    }

    // Execute in batches of 50
    for (let i = 0; i < ops.length; i += 50) {
      await prisma.$transaction(ops.slice(i, i + 50))
      result.synced += Math.min(50, ops.length - i)
    }

  } catch (err: any) {
    result.error = err.message
    console.error(`Bulk sync ${entity} page ${page} error:`, err)
  }

  result.durationMs = Date.now() - startTime
  console.log(`Bulk sync ${entity} page ${page}: ${result.synced} synced, ${result.skipped} skipped, ${result.apiCalls} API call, ${result.durationMs}ms`)
  return result
}
