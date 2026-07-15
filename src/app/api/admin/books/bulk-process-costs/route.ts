import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Bulk Process Costs — processes one page of documents at a time.
 * 
 * Supports invoices, sales orders, and quotes (estimates).
 * Fetches a page from Zoho Books and calls the appropriate cost processor for each.
 * 
 * POST body:
 *   - entity: 'invoices' | 'salesorders' | 'estimates' (default 'invoices')
 *   - page: number (default 1)
 *   - filter: 'all' | 'unpaid' | 'recent' (default 'unpaid')
 *   - perPage: number (default 25, max 50)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const entity = body.entity || 'invoices'
    const page = parseInt(body.page || '1', 10)
    const filter = body.filter || 'unpaid'
    const perPage = Math.min(parseInt(body.perPage || '25', 10), 50)

    const { getZohoAccessToken } = await import("../../../../../../netlify/functions/lib/zoho-auth")

    const ZOHO_DC = process.env.ZOHO_DC || 'com'
    const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // Entity-specific config
    const entityConfig: Record<string, { endpoint: string, arrayKey: string, idField: string, numberField: string, processRoute: string, idBodyField: string }> = {
      invoices: { endpoint: 'invoices', arrayKey: 'invoices', idField: 'invoice_id', numberField: 'invoice_number', processRoute: '/api/process-invoice-costs', idBodyField: 'invoiceId' },
      salesorders: { endpoint: 'salesorders', arrayKey: 'salesorders', idField: 'salesorder_id', numberField: 'salesorder_number', processRoute: '/api/process-salesorder-costs', idBodyField: 'salesorderId' },
      estimates: { endpoint: 'estimates', arrayKey: 'estimates', idField: 'estimate_id', numberField: 'estimate_number', processRoute: '/api/process-quote-costs', idBodyField: 'estimateId' },
    }

    const config = entityConfig[entity]
    if (!config) {
      return NextResponse.json({ success: false, error: `Unknown entity: ${entity}` }, { status: 400 })
    }

    // Build filter params
    let statusFilter = ''
    if (entity === 'invoices') {
      if (filter === 'unpaid') {
        statusFilter = '&status=sent,overdue,partially_paid'
      } else if (filter === 'recent') {
        const since = new Date()
        since.setDate(since.getDate() - 90)
        statusFilter = `&date_start=${since.toISOString().split('T')[0]}`
      }
    } else if (filter === 'recent') {
      const since = new Date()
      since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split('T')[0]}`
    }

    // Fetch one page
    const sortParam = entity === 'estimates' ? '' : '&sort_column=date&sort_order=D'
    const listRes = await fetch(
      `${baseUrl}/${config.endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}${sortParam}${statusFilter}`,
      { headers: authHeaders }
    )

    if (!listRes.ok) {
      return NextResponse.json({ success: false, error: `Zoho API error ${listRes.status}` }, { status: 500 })
    }

    const listData: any = await listRes.json()
    if (listData.code !== 0) {
      return NextResponse.json({ success: false, error: listData.message }, { status: 500 })
    }

    const items = listData[config.arrayKey] || []
    const hasMore = listData.page_context?.has_more_page || false

    if (items.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, hasMore: false, page })
    }

    // Process each item
    const origin = req.nextUrl.origin
    let processed = 0
    let errors = 0
    const results: any[] = []

    for (const item of items) {
      try {
        const costRes = await fetch(`${origin}${config.processRoute}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [config.idBodyField]: item[config.idField],
            skipLoopGuard: true,
          })
        })

        const costData = await costRes.json()
        if (costData.success) {
          processed++
          results.push({
            number: item[config.numberField],
            customer: item.customer_name,
            status: costData.skipped ? 'skipped' : 'processed',
            fieldsUpdated: costData.invoice?.fieldsUpdated || costData.salesorder?.fieldsUpdated || costData.quote?.fieldsUpdated || 0,
            changesDetected: costData.invoice?.changesDetected || costData.salesorder?.changesDetected || costData.quote?.changesDetected || 0,
          })
        } else {
          errors++
          results.push({
            number: item[config.numberField],
            customer: item.customer_name,
            status: 'error',
            error: costData.error,
          })
        }
      } catch (err: any) {
        errors++
        results.push({
          number: item[config.numberField],
          customer: item.customer_name,
          status: 'error',
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      entity,
      page,
      processed,
      errors,
      total: items.length,
      hasMore,
      results,
    })

  } catch (error: any) {
    console.error("Bulk process costs error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
