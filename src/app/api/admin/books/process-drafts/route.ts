import { NextResponse } from "next/server"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"

const ORG_ID = ZOHO_ORGANIZATION_ID
const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function POST() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const token = await getZohoAccessToken()
    if (!token) {
      return NextResponse.json({ error: "Could not retrieve Zoho access token" }, { status: 500 })
    }

    let page = 1
    let allDraftInvoices: any[] = []
    let hasMore = true

    while (hasMore) {
      const listRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&status=draft&page=${page}&per_page=200`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      
      if (!listRes.ok) {
        throw new Error(`Failed to fetch draft invoices: ${listRes.status}`)
      }

      const listData = await listRes.json()
      const invoices = listData.invoices || []
      
      if (invoices.length === 0) break
      allDraftInvoices = allDraftInvoices.concat(invoices)
      
      hasMore = listData.page_context?.has_more_page || false
      page++
    }

    if (allDraftInvoices.length === 0) {
      return NextResponse.json({ message: "No draft invoices found to process." })
    }

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms))
    let processed = 0

    for (const inv of allDraftInvoices) {
      const updateRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${inv.invoice_id}/status/sent?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })

      if (updateRes.ok) processed++
      await delay(300)
    }

    return NextResponse.json({ message: `Successfully changed ${processed} drafts to Sent.` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
