import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * Bulk Process Costs — processes one page of invoices at a time.
 * 
 * Fetches a page of invoices from Zoho Books (via the existing bulk-sync
 * zoho-auth pattern) and calls process-invoice-costs for each one.
 * 
 * POST body:
 *   - page: number (default 1)
 *   - filter: 'all' | 'unpaid' | 'recent' (default 'unpaid')
 *   - perPage: number (default 25, max 50)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const page = parseInt(body.page || '1', 10)
    const filter = body.filter || 'unpaid'
    const perPage = Math.min(parseInt(body.perPage || '25', 10), 50)

    // Use the zoho-auth from netlify functions lib (dynamic import avoids path issues)
    const { getZohoAccessToken } = await import("../../../../../../netlify/functions/lib/zoho-auth")

    const ZOHO_DC = process.env.ZOHO_DC || 'com'
    const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // Build filter params
    let statusFilter = ''
    if (filter === 'unpaid') {
      statusFilter = '&status=sent,overdue,partially_paid'
    } else if (filter === 'recent') {
      const since = new Date()
      since.setDate(since.getDate() - 90)
      statusFilter = `&date_start=${since.toISOString().split('T')[0]}`
    }

    // Fetch one page of invoices (list view)
    const listRes = await fetch(
      `${baseUrl}/invoices?organization_id=${ORG_ID}&page=${page}&per_page=${perPage}&sort_column=date&sort_order=D${statusFilter}`,
      { headers: authHeaders }
    )

    if (!listRes.ok) {
      return NextResponse.json({ success: false, error: `Zoho API error ${listRes.status}` }, { status: 500 })
    }

    const listData: any = await listRes.json()
    if (listData.code !== 0) {
      return NextResponse.json({ success: false, error: listData.message }, { status: 500 })
    }

    const invoices = listData.invoices || []
    const hasMore = listData.page_context?.has_more_page || false

    if (invoices.length === 0) {
      return NextResponse.json({ success: true, processed: 0, errors: 0, hasMore: false, page })
    }

    // Process each invoice by calling our process-invoice-costs internally
    const origin = req.nextUrl.origin
    let processed = 0
    let errors = 0
    const results: any[] = []

    for (const inv of invoices) {
      try {
        const costRes = await fetch(`${origin}/api/process-invoice-costs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: inv.invoice_id,
            skipLoopGuard: true,
          })
        })

        const costData = await costRes.json()
        if (costData.success) {
          processed++
          results.push({
            invoiceNumber: inv.invoice_number,
            customer: inv.customer_name,
            status: costData.skipped ? 'skipped' : 'processed',
            fieldsUpdated: costData.invoice?.fieldsUpdated || 0,
            changesDetected: costData.invoice?.changesDetected || 0,
          })
        } else {
          errors++
          results.push({
            invoiceNumber: inv.invoice_number,
            customer: inv.customer_name,
            status: 'error',
            error: costData.error,
          })
        }
      } catch (err: any) {
        errors++
        results.push({
          invoiceNumber: inv.invoice_number,
          customer: inv.customer_name,
          status: 'error',
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      page,
      processed,
      errors,
      total: invoices.length,
      hasMore,
      results,
    })

  } catch (error: any) {
    console.error("Bulk process costs error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
