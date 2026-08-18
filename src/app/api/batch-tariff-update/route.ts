import { NextRequest, NextResponse } from "next/server"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
/**
 * batch-tariff-update — Inline Next.js route (no Netlify proxy)
 *
 * Applies (or previews) a 12.5% tariff surcharge to all qualifying
 * 2026 unpaid invoices in Zoho Books. Defaults to dryRun=true for safety.
 *
 * POST body: { dryRun?: boolean }
 */

export const maxDuration = 60

const ZOHO_DC    = process.env.ZOHO_DC || "com"
const TARIFF_RATE = 0.125 // 12.5%

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function isGiftItem(item: any): boolean {
  const name = (item.name || "").toLowerCase()
  const desc = (item.description || "").toLowerCase()
  if (name.includes("gift") || desc.includes("gift")) return true
  const customFields = item.item_custom_fields || []
  for (const cf of customFields) {
    if ((cf.label || "").toUpperCase().includes("GIFT")) {
      return cf.value === true || cf.value === "true"
    }
  }
  return false
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

export async function POST(req: NextRequest) {
  try {
    let body: any = {}
    try { body = await req.json() } catch { /* use defaults */ }
    const { dryRun = true } = body

    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    const baseUrl    = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Fetch all unpaid 2026 invoices
    const unpaidStatuses = ["sent", "overdue", "partially_paid"]
    let allInvoices: any[] = []

    for (const status of unpaidStatuses) {
      let page = 1
      let hasMore = true
      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}&status=${status}&date_start=2026-01-01&date_end=2026-12-31&per_page=200&page=${page}`
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: authHeaders })
        if (!res.ok) { console.warn(`Failed to fetch ${status} page ${page}: ${res.status}`); break }
        const data: any = await res.json()
        allInvoices = allInvoices.concat(data.invoices || [])
        hasMore = data.page_context?.has_more_page || false
        page++
        await delay(200)
      }
    }

    // 2. Filter: only invoices with no existing adjustment
    const zeroAdjInvoices = allInvoices.filter((inv) => parseFloat(inv.adjustment || 0) === 0)

    const results: any[] = []
    let processedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const invHeader of zeroAdjInvoices) {
      try {
        const detailRes = await fetch(
          `${baseUrl}/invoices/${invHeader.invoice_id}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders }
        )
        if (!detailRes.ok) { errorCount++; continue }
        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) { errorCount++; continue }

        const invoice = detailData.invoice
        const customFields = invoice.custom_fields || []

        // Skip if "Remove Tariff Surcharge" is checked
        const removeTariffField = customFields.find((f: any) =>
          f.label.toUpperCase().includes("REMOVE TARIFF")
        )
        if (removeTariffField && (removeTariffField.value === true || removeTariffField.value === "true")) {
          skippedCount++; continue
        }

        // Calculate 12.5% of dead cost on non-gift items
        let nonGiftDeadCost = 0
        for (const item of invoice.line_items || []) {
          if (!isGiftItem(item)) {
            nonGiftDeadCost += parseFloat(item.purchase_rate || 0) * parseFloat(item.quantity || 1)
          }
        }

        const tariffAmount = parseFloat((nonGiftDeadCost * TARIFF_RATE).toFixed(2))
        if (tariffAmount <= 0) { skippedCount++; continue }

        if (!dryRun) {
          const putRes = await fetch(
            `${baseUrl}/invoices/${invoice.invoice_id}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
              method: "PUT",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                customer_id: invoice.customer_id,
                adjustment: tariffAmount,
                adjustment_description: "TARIFF SURCHARGE",
              }),
            }
          )
          const putData: any = await putRes.json()
          if (!putRes.ok || putData.code !== 0) {
            const errMsg = putData.message || `HTTP ${putRes.status}`
            errorCount++
            results.push({
              invoiceNumber: invoice.invoice_number,
              customerName: invoice.customer_name,
              status: "error",
              error: errMsg,
              tariffAmount,
            })
            continue
          }
          await delay(300)
        }

        processedCount++
        results.push({
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          subTotal: parseFloat(invoice.sub_total || 0),
          nonGiftDeadCost,
          tariffAmount,
          status: dryRun ? "dry-run" : "updated",
        })

        await delay(300)
      } catch (e: any) {
        console.error(`Error processing ${invHeader.invoice_number}:`, e.message)
        errorCount++
      }
    }

    return NextResponse.json(
      {
        success: true,
        dryRun,
        summary: {
          totalUnpaid2026: allInvoices.length,
          zeroAdjustment: zeroAdjInvoices.length,
          processed: processedCount,
          skipped: skippedCount,
          errors: errorCount,
          tariffRate: `${TARIFF_RATE * 100}%`,
        },
        invoices: results,
      },
      { headers: CORS }
    )
  } catch (err: any) {
    console.error("batch-tariff-update error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: CORS })
  }
}

export async function OPTIONS() {
  return new NextResponse("", { status: 204, headers: CORS })
}
