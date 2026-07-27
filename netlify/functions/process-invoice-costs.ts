import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { calculateDocumentCosts } from "./lib/cost-calculations"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

// ── Loop Guard ──
// Prevents re-entry when our PUT triggers a Zoho workflow that calls back
const recentlyProcessed = new Map<string, number>()
const LOOP_GUARD_TTL = 60_000 // 60 seconds

function isRecentlyProcessed(id: string): boolean {
  const t = recentlyProcessed.get(id)
  return !!(t && Date.now() - t < LOOP_GUARD_TTL)
}

function markProcessed(id: string) {
  recentlyProcessed.set(id, Date.now())
  for (const [k, t] of recentlyProcessed) {
    if (Date.now() - t > LOOP_GUARD_TTL * 2) recentlyProcessed.delete(k)
  }
}

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { invoiceNumber, invoiceId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard } = body

    if (!invoiceNumber && !invoiceId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing invoiceNumber or invoiceId" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Resolve Zoho Books invoice ID
    let booksInvoiceId = invoiceId
    if (!booksInvoiceId && invoiceNumber) {
      const searchRes = await fetch(`${baseUrl}/invoices?organization_id=${ORG_ID}&invoice_number=${invoiceNumber}`, { headers: authHeaders })
      if (!searchRes.ok) throw new Error(`Failed to search for invoice: ${searchRes.status}`)
      const searchData: any = await searchRes.json()
      if (!searchData.invoices?.length) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Invoice ${invoiceNumber} not found in Zoho Books` }) }
      }
      booksInvoiceId = searchData.invoices[0].invoice_id
    }

    // 2. Loop guard
    if (!skipLoopGuard && isRecentlyProcessed(booksInvoiceId)) {
      console.log(`Loop guard: Skipping invoice ${booksInvoiceId}`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, skipped: true, reason: "Loop guard — recently processed" }) }
    }

    // 3. Fetch full invoice
    const detailRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch invoice details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const invoice = detailData.invoice

    // 4. Calculate all costs via shared module
    const calc = await calculateDocumentCosts(invoice, { manualVigRate, manualCommPct, noVigOverrides })
    const {
      deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
      vigRate, deadCostPlusVig,
      ccFees, additionalCosts, insurance,
      subTotal, profit, marginPercent, deadProfitActual,
      commissionPct, salesCommission, isPaid,
      lineItemDetails, lineItemBreakdownStrings,
    } = calc

    const salespersonName = invoice.salesperson_name
    console.log(`\n=== Processing Invoice ${invoice.invoice_number} ===`)
    console.log(`  Customer: ${invoice.customer_name} | Rep: ${salespersonName || "N/A"}`)
    console.log(`  SubTotal: $${subTotal.toFixed(2)} | DeadCost: $${deadCostTotal.toFixed(2)} | VIG: ${vigRate}x | Profit: $${profit.toFixed(2)} (${marginPercent.toFixed(1)}%)`)
    console.log(`  Insurance: $${insurance.toFixed(2)} (not deducted) | Commission: $${salesCommission.toFixed(2)}`)

    // 5. Build custom field updates — only fields that changed
    const existingFields = invoice.custom_fields || []
    const existingPaidDate = existingFields.find((f: any) => f.label.toUpperCase().includes("PAID IN FULL DATE"))
    const fieldsToUpdate: any[] = []

    const fieldMap: Record<string, any> = {
      "DEAD COST TOTAL": deadCostTotal.toFixed(2),
      "DEAD COST SUBJECT TO VIG": deadCostSubjectToVig.toFixed(2),
      "DEAD COST NO VIG": deadCostNoVig.toFixed(2),
      "SALESPERSON VIG": vigRate,
      "DEAD COST PLUS VIG": deadCostPlusVig.toFixed(2),
      "PROFIT": profit.toFixed(2),
      "COMMISSION FROM PROFIT %": commissionPct,
      "SALES COMMISSION": salesCommission.toFixed(2),
      "ITEMS DC BREAKDOWN": lineItemBreakdownStrings.join("\n"),
    }
    const apiNameMap: Record<string, any> = { cf_dead_profit_actual: deadProfitActual.toFixed(2) }
    if (isPaid && existingPaidDate && !existingPaidDate.value) {
      fieldMap["PAID IN FULL DATE"] = new Date().toISOString().split("T")[0]
    }

    let changesDetected = 0
    for (const [label, value] of Object.entries(fieldMap)) {
      const field = existingFields.find((f: any) => f.label.toUpperCase().trim() === label)
      if (field) {
        if (String(field.value || "").trim() !== String(value).trim()) {
          fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
          changesDetected++
        }
      } else {
        console.warn(`Custom field "${label}" not found on invoice`)
      }
    }
    for (const [apiName, value] of Object.entries(apiNameMap)) {
      const field = existingFields.find((f: any) => f.api_name === apiName)
      if (field && String(field.value || "").trim() !== String(value).trim()) {
        if (!fieldsToUpdate.some((f: any) => f.customfield_id === field.customfield_id)) {
          fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
          changesDetected++
        }
      } else if (!field) {
        console.warn(`Custom field api_name "${apiName}" not found on invoice`)
      }
    }

    // 6. PUT to Zoho Books — only if changes exist
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
      markProcessed(booksInvoiceId)
      const putRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ custom_fields: fieldsToUpdate }),
      })
      const putData: any = await putRes.json()
      zohoUpdateResult = { ok: putRes.ok, code: putData.code, message: putData.message }
      if (!putRes.ok || putData.code !== 0) {
        console.error("Zoho Books update failed:", JSON.stringify(putData))
      } else {
        console.log(`✅ Updated ${fieldsToUpdate.length} fields on invoice ${invoice.invoice_number}`)
      }
    } else {
      console.log(`⏭️ No changes for invoice ${invoice.invoice_number} — skipping PUT`)
    }

    // 7. Update local DB
    const localInvoice = await prisma.invoice.findFirst({
      where: { OR: [{ items: { path: ["invoiceNumber"], equals: invoice.invoice_number } }, { items: { path: ["booksInvoiceId"], equals: booksInvoiceId } }] },
    })
    if (localInvoice) {
      const currentItems = (localInvoice.items as any) || {}
      await prisma.invoice.update({
        where: { id: localInvoice.id },
        data: {
          items: {
            ...currentItems,
            deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
            deadProfitActual, profit,
            commission: salesCommission, commissionPercent: commissionPct, vigRate,
            lineItemDetails,
            itemsDcBreakdown: lineItemBreakdownStrings,
            custom_fields: existingFields,
            ...(isPaid && !currentItems.paidInFullDate ? { paidInFullDate: new Date().toISOString().split("T")[0] } : {}),
          },
        },
      })
    }


    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        invoice: {
          invoiceNumber: invoice.invoice_number, booksInvoiceId,
          customerName: invoice.customer_name, salesperson: salespersonName,
          subTotal, deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig, ccFees, additionalCosts, insurance,
          deadProfitActual, profit, marginPercent: parseFloat(marginPercent.toFixed(1)),
          commissionPercent: commissionPct, salesCommission,
          lineItems: lineItemDetails, itemsDcBreakdown: lineItemBreakdownStrings,
          fieldsUpdated: fieldsToUpdate.length, changesDetected, zohoUpdateResult,
        },
      }),
    }
  } catch (err: any) {
    console.error("process-invoice-costs error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
