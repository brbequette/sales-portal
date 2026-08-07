import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
const ZOHO_DC = process.env.ZOHO_DC || "com"

const TARIFF_RATE = 0.125 // 12.5%

function isGiftItem(item: any): boolean {
  const name = (item.name || '').toLowerCase()
  const desc = (item.description || '').toLowerCase()
  if (name.includes('gift') || desc.includes('gift')) return true

  // Check item-level custom fields for a gift checkbox
  const customFields = item.item_custom_fields || []
  for (const cf of customFields) {
    const label = (cf.label || '').toUpperCase()
    if (label.includes('GIFT')) {
      return cf.value === true || cf.value === 'true'
    }
  }
  return false
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { dryRun = true } = body // Default to dry run for safety

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Fetch all unpaid invoices from 2026
    //    Zoho Books statuses: sent, overdue, partially_paid, draft
    //    We want: NOT paid, NOT void, NOT draft, NOT writeoff
    const unpaidStatuses = ['sent', 'overdue', 'partially_paid']
    let allInvoices: any[] = []

    for (const status of unpaidStatuses) {
      let page = 1
      let hasMore = true

      while (hasMore) {
        const url = `${baseUrl}/invoices?organization_id=${ORG_ID}&status=${status}&date_start=2026-01-01&date_end=2026-12-31&per_page=200&page=${page}`
        const res = await fetch(url, { headers: authHeaders })

        if (!res.ok) {
          console.warn(`Failed to fetch ${status} invoices page ${page}: ${res.status}`)
          break
        }

        const data: any = await res.json()
        const invoices = data.invoices || []
        allInvoices = allInvoices.concat(invoices)

        hasMore = data.page_context?.has_more_page || false
        page++
        await delay(200) // Rate limit
      }
    }

    console.log(`Found ${allInvoices.length} total unpaid 2026 invoices`)

    // 2. Filter: adjustment == 0 (no existing tariff)
    const zeroAdjInvoices = allInvoices.filter(inv => {
      const adj = parseFloat(inv.adjustment || 0)
      return adj === 0
    })

    console.log(`${zeroAdjInvoices.length} have zero adjustment`)

    // 3. For each, fetch detail to check "Remove Tariff Surcharge" checkbox and line items
    const results: any[] = []
    let processedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const invHeader of zeroAdjInvoices) {
      try {
        // Fetch full invoice detail
        const detailRes = await fetch(`${baseUrl}/invoices/${invHeader.invoice_id}?organization_id=${ORG_ID}`, { headers: authHeaders })
        if (!detailRes.ok) {
          console.warn(`Failed to fetch detail for ${invHeader.invoice_number}: ${detailRes.status}`)
          errorCount++
          continue
        }

        const detailData: any = await detailRes.json()
        if (detailData.code !== 0) {
          errorCount++
          continue
        }

        const invoice = detailData.invoice
        const customFields = invoice.custom_fields || []

        // Check "Remove Tariff Surcharge" checkbox — skip if checked
        const removeTariffField = customFields.find((f: any) =>
          f.label.toUpperCase().includes('REMOVE TARIFF')
        )
        if (removeTariffField && (removeTariffField.value === true || removeTariffField.value === 'true')) {
          console.log(`Skipping ${invoice.invoice_number} — Remove Tariff is checked`)
          skippedCount++
          continue
        }

        // 4. Calculate tariff: 12.5% of dead cost of non-gift items
        let nonGiftDeadCost = 0
        const lineItems = invoice.line_items || []

        for (const item of lineItems) {
          if (!isGiftItem(item)) {
            const cost = parseFloat(item.purchase_rate || 0)
            const qty = parseFloat(item.quantity || 1)
            nonGiftDeadCost += cost * qty
          }
        }

        const tariffAmount = parseFloat((nonGiftDeadCost * TARIFF_RATE).toFixed(2))

        if (tariffAmount <= 0) {
          console.log(`Skipping ${invoice.invoice_number} — no non-gift dead cost`)
          skippedCount++
          continue
        }

        console.log(`${invoice.invoice_number}: Non-gift dead cost=$${nonGiftDeadCost.toFixed(2)}, Tariff=$${tariffAmount.toFixed(2)}`)

        if (!dryRun) {
          // 5. Apply tariff as adjustment — Zoho requires customer_id on PUT
          const putRes = await fetch(`${baseUrl}/invoices/${invoice.invoice_id}?organization_id=${ORG_ID}`, {
            method: "PUT",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: invoice.customer_id,
              adjustment: tariffAmount,
              adjustment_description: "TARIFF SURCHARGE"
            })
          })

          const putData: any = await putRes.json()
          if (!putRes.ok || putData.code !== 0) {
            const errMsg = putData.message || `HTTP ${putRes.status}`
            console.error(`Failed to update ${invoice.invoice_number}: ${errMsg}`)
            errorCount++
            results.push({
              invoiceNumber: invoice.invoice_number,
              customerName: invoice.customer_name,
              status: 'error',
              error: errMsg,
              tariffAmount
            })
            continue
          }

          // 6. Tariff applied successfully
          await delay(300)
        }

        processedCount++
        results.push({
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          subTotal: parseFloat(invoice.sub_total || 0),
          nonGiftDeadCost,
          tariffAmount,
          status: dryRun ? 'dry-run' : 'updated'
        })

        await delay(300) // Rate limit
      } catch (e: any) {
        console.error(`Error processing ${invHeader.invoice_number}:`, e.message)
        errorCount++
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        dryRun,
        summary: {
          totalUnpaid2026: allInvoices.length,
          zeroAdjustment: zeroAdjInvoices.length,
          processed: processedCount,
          skipped: skippedCount,
          errors: errorCount,
          tariffRate: `${TARIFF_RATE * 100}%`
        },
        invoices: results
      })
    }

  } catch (err: any) {
    console.error("batch-tariff-update error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
