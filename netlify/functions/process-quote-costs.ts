import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { calculateDocumentCosts, buildFieldsToUpdate } from "./lib/cost-calculations"

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
    const { estimateNumber, estimateId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard } = body

    if (!estimateNumber && !estimateId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing estimateNumber or estimateId" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Resolve Zoho Books estimate ID
    let booksEstimateId = estimateId
    if (!booksEstimateId && estimateNumber) {
      const searchRes = await fetch(`${baseUrl}/estimates?organization_id=${ORG_ID}&estimate_number=${estimateNumber}`, { headers: authHeaders })
      if (!searchRes.ok) throw new Error(`Failed to search for estimate: ${searchRes.status}`)
      const searchData: any = await searchRes.json()
      if (!searchData.estimates?.length) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Quote ${estimateNumber} not found in Zoho Books` }) }
      }
      booksEstimateId = searchData.estimates[0].estimate_id
    }

    // 2. Loop guard
    if (!skipLoopGuard && isRecentlyProcessed(booksEstimateId)) {
      console.log(`Loop guard: Skipping estimate ${booksEstimateId}`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, skipped: true, reason: "Loop guard — recently processed" }) }
    }

    // 3. Fetch full estimate
    const detailRes = await fetch(`${baseUrl}/estimates/${booksEstimateId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch estimate details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const estimate = detailData.estimate

    // 4. Calculate all costs via shared module
    const calc = await calculateDocumentCosts(estimate, { manualVigRate, manualCommPct, noVigOverrides })
    const {
      deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
      vigRate, deadCostPlusVig,
      ccFees, additionalCosts, insurance,
      subTotal, profit, marginPercent, deadProfitActual,
      commissionPct, salesCommission,
      lineItemDetails, lineItemBreakdownStrings,
    } = calc

    const salespersonName = estimate.salesperson_name
    console.log(`\n=== Processing Quote ${estimate.estimate_number} ===`)
    console.log(`  Customer: ${estimate.customer_name} | Rep: ${salespersonName || "N/A"}`)
    console.log(`  SubTotal: $${subTotal.toFixed(2)} | DeadCost: $${deadCostTotal.toFixed(2)} | VIG: ${vigRate}x | Profit: $${profit.toFixed(2)} (${marginPercent.toFixed(1)}%)`)
    console.log(`  Insurance: $${insurance.toFixed(2)} (not deducted) | Commission: $${salesCommission.toFixed(2)}`)

    const fieldsToUpdate = buildFieldsToUpdate(calc, estimate, "quotes")
    const changesDetected = fieldsToUpdate.length

    // 6. PUT to Zoho Books — only if changes exist
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
      markProcessed(booksEstimateId)
      const putRes = await fetch(`${baseUrl}/estimates/${booksEstimateId}?organization_id=${ORG_ID}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ custom_fields: fieldsToUpdate }),
      })
      const putData: any = await putRes.json()
      zohoUpdateResult = { ok: putRes.ok, code: putData.code, message: putData.message }
      if (!putRes.ok || putData.code !== 0) {
        console.error("Zoho Books update failed:", JSON.stringify(putData))
      } else {
        console.log(`✅ Updated ${fieldsToUpdate.length} fields on quote ${estimate.estimate_number} (${changesDetected} changed)`)
      }
    } else {
      console.log(`⏭️ No changes for quote ${estimate.estimate_number} — skipping PUT`)
    }

    // 7. Update local DB
    const localQuote = await prisma.quote.findFirst({
      where: { OR: [{ items: { path: ["estimateNumber"], equals: estimate.estimate_number } }, { zohoId: booksEstimateId }] },
    })
    if (localQuote) {
      const currentItems = (localQuote.items as any) || {}
      await prisma.quote.update({
        where: { id: localQuote.id },
        data: {
          amount: subTotal,
          items: {
            ...currentItems,
            sub_total: subTotal,
            subTotal: subTotal,
            deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
            deadProfitActual, profit,
            commission: salesCommission, commissionPercent: commissionPct, vigRate,
            lineItemDetails,
            itemsDcBreakdown: lineItemBreakdownStrings,
            custom_fields: estimate.custom_fields || [],
          },
        },
      })
    }


    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        quote: {
          estimateNumber: estimate.estimate_number, booksEstimateId,
          customerName: estimate.customer_name, salesperson: salespersonName,
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
    console.error("process-quote-costs error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
