import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

// ── Loop Guard ──
// Prevents re-entry when our PUT triggers a Zoho workflow that calls back
const recentlyProcessed = new Map<string, number>()
const LOOP_GUARD_TTL = 60_000 // 60 seconds

function isRecentlyProcessed(estimateId: string): boolean {
  const lastTime = recentlyProcessed.get(estimateId)
  if (lastTime && Date.now() - lastTime < LOOP_GUARD_TTL) return true
  return false
}

function markProcessed(estimateId: string) {
  recentlyProcessed.set(estimateId, Date.now())
  // Cleanup old entries
  for (const [id, time] of recentlyProcessed) {
    if (Date.now() - time > LOOP_GUARD_TTL * 2) recentlyProcessed.delete(id)
  }
}

// Determine if a line item should NOT have VIG applied.
// VIG is removed when:
//   1. The item has a "Subject to VIG" checkbox that is unchecked (false)
// Gift items ARE included in dead costs but go to the NO VIG bucket
function isNoVigItem(item: any): boolean {
  // Check item-level custom fields for a "Subject to VIG" checkbox
  const customFields = item.item_custom_fields || []
  for (const cf of customFields) {
    const label = (cf.label || '').toUpperCase()
    if (label.includes('SUBJECT TO VIG') || label.includes('VIG') || label.includes('REMOVE VIG')) {
      if (label.includes('REMOVE') || label.includes('NO VIG')) {
        return cf.value === true || cf.value === 'true'
      }
      return cf.value === false || cf.value === 'false' || cf.value === ''
    }
  }
  return false // default: item IS subject to VIG
}

// Check if an item is a gift
function isGiftItem(item: any): boolean {
  const name = (item.name || '').toLowerCase()
  const desc = (item.description || '').toLowerCase()
  if (item.is_gift || name.includes('gift') || desc.includes('gift')) return true
  // Check custom fields for gift flag
  const customFields = item.item_custom_fields || []
  for (const cf of customFields) {
    const label = (cf.label || '').toUpperCase()
    if (label.includes('GIFT')) {
      return cf.value === true || cf.value === 'true'
    }
  }
  return false
}

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
    const { estimateNumber, estimateId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard } = body

    if (!estimateNumber && !estimateId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing estimateNumber or estimateId" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Find the estimate in Zoho Books
    let booksEstimateId = estimateId
    if (!booksEstimateId && estimateNumber) {
      const searchRes = await fetch(`${baseUrl}/estimates?organization_id=${ORG_ID}&estimate_number=${estimateNumber}`, { headers: authHeaders })
      if (!searchRes.ok) throw new Error(`Failed to search for estimate: ${searchRes.status}`)
      const searchData: any = await searchRes.json()
      if (!searchData.estimates || searchData.estimates.length === 0) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Quote ${estimateNumber} not found in Zoho Books` }) }
      }
      booksEstimateId = searchData.estimates[0].estimate_id
    }

    // ── Loop Guard Check ──
    if (!skipLoopGuard && isRecentlyProcessed(booksEstimateId)) {
      console.log(`Loop guard: Skipping estimate ${booksEstimateId} — processed within last ${LOOP_GUARD_TTL / 1000}s`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, skipped: true, reason: 'Loop guard — recently processed' }) }
    }

    // 2. Fetch full estimate details
    const detailRes = await fetch(`${baseUrl}/estimates/${booksEstimateId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch estimate details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const estimate = detailData.estimate

    // 3. Calculate Dead Costs from line items
    // Gift items: their purchase_rate is included in dead costs (NO VIG bucket)
    // Regular items: purchase_rate goes to Subject to VIG or No VIG based on checkbox
    let deadCostSubjectToVig = 0
    let deadCostNoVig = 0
    const lineItemBreakdown: string[] = []
    const lineItemDetails: any[] = []

    for (const item of (estimate.line_items || [])) {
      const cost = parseFloat(item.purchase_rate || item.cost || 0)
      const qty = parseFloat(item.quantity || 1)
      const itemDeadCost = cost * qty
      const rate = parseFloat(item.rate || 0)
      const itemTotal = parseFloat(item.item_total || 0)

      const gift = isGiftItem(item)

      // Determine VIG eligibility (user overrides take priority)
      let noVig = isNoVigItem(item)
      if (noVigOverrides && item.line_item_id && noVigOverrides[item.line_item_id] !== undefined) {
        noVig = noVigOverrides[item.line_item_id]
      }
      // Gift items always go to NO VIG bucket but ARE included in dead costs
      if (gift) noVig = true

      if (noVig) {
        deadCostNoVig += itemDeadCost
      } else {
        deadCostSubjectToVig += itemDeadCost
      }

      const flags = []
      if (noVig && !gift) flags.push('No VIG')
      if (gift) flags.push('GIFT')

      lineItemBreakdown.push('') // placeholder — rebuilt after vigRate is known
      lineItemDetails.push({
        name: item.name,
        sku: item.sku || null,
        quantity: qty,
        rate,
        cost,
        itemTotal,
        deadCost: itemDeadCost,
        noVig,
        gift
      })
    }

    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig

    // 4. Determine VIG rate
    let vigRate = manualVigRate || null
    const salespersonName = estimate.salesperson_name

    if (!vigRate) {
      const existingVig = estimate.custom_fields?.find((f: any) =>
        f.label.toUpperCase().includes('SALESPERSON VIG') || f.api_name === 'cf_salesperson_vig'
      )
      if (existingVig && existingVig.value && parseFloat(existingVig.value) > 0) {
        vigRate = parseFloat(existingVig.value)
      }
    }

    if (!vigRate && salespersonName) {
      const users = await prisma.user.findMany()
      const isMontgomery = salespersonName.toLowerCase().includes('montgomery') || salespersonName.toLowerCase().includes('morgan')
      if (isMontgomery) {
        vigRate = 1.0
      } else {
        const user = users.find(u => u.name && (
          salespersonName.toLowerCase().includes(u.name.toLowerCase()) ||
          u.name.toLowerCase().includes(salespersonName.toLowerCase())
        ))
        if (user) {
          const settings = await prisma.systemSetting.findUnique({ where: { key: 'vig_settings' } })
          const allVigSettings = settings ? JSON.parse(settings.value) : {}
          const userVig = allVigSettings[user.id]
          if (userVig) {
            if (userVig.constantVigEnabled && userVig.constantVigValue !== null) {
              vigRate = userVig.constantVigValue
            } else {
              const estDate = estimate.date || estimate.created_time
              const monthKey = estDate ? new Date(estDate).toISOString().substring(0, 7) : new Date().toISOString().substring(0, 7)
              const monthlyGoal = (userVig.monthlyVigGoals || []).find((g: any) => g.monthKey === monthKey)
              if (monthlyGoal && monthlyGoal.manualVigRate !== null) {
                vigRate = monthlyGoal.manualVigRate
              }
            }
          }
        }
      }
    }

    if (!vigRate) vigRate = 1.5 // fallback default

    // 5. Calculate Dead Cost Plus VIG
    const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig

    // Rebuild ITEMS DC BREAKDOWN now that vigRate is finalized
    const finalBreakdown = lineItemDetails.map(d => {
      const vigDC = d.noVig ? d.deadCost : d.deadCost * vigRate
      const vigLabel = d.noVig ? 'No VIG' : 'Subj to VIG'
      const flags = []
      if (d.noVig && !d.gift) flags.push('No VIG')
      if (d.gift) flags.push('GIFT')
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
      return `${d.quantity}x ${d.sku || d.name} | Cost: $${d.cost.toFixed(2)} | DC: $${d.deadCost.toFixed(2)} | VIG-DC: $${vigDC.toFixed(2)} | ${vigLabel}${flagStr}`
    })

    // 6. Calculate Profit = Sub_Total - Dead Cost Plus VIG - CC Fees - Additional Costs - Insurance
    const subTotal = parseFloat(estimate.sub_total || 0)

    const ccFeesField = estimate.custom_fields?.find((f: any) => f.label.toUpperCase().includes('CREDIT CARD PROCESSING'))
    const additionalCostsField = estimate.custom_fields?.find((f: any) => f.label.toUpperCase().includes('ADDITIONAL COSTS SEE'))
    const insuranceField = estimate.custom_fields?.find((f: any) => f.label.toUpperCase() === 'INSURANCE')

    const ccFees = ccFeesField ? parseFloat(ccFeesField.value || 0) : 0
    const additionalCosts = additionalCostsField ? parseFloat(additionalCostsField.value || 0) : 0
    const insurance = insuranceField ? parseFloat(insuranceField.value || 0) : 0

    const totalDeductions = deadCostPlusVig + ccFees + additionalCosts + insurance
    const profit = subTotal - totalDeductions
    const marginPercent = subTotal > 0 ? (profit / subTotal) * 100 : 0

    // Dead Profit Actual = Subtotal - Dead Cost Total (raw margin, no VIG, no fees)
    const deadProfitActual = subTotal - deadCostTotal

    // 7. Calculate Commission
    let commissionPct = manualCommPct
    if (!commissionPct) {
      const existingCommPct = estimate.custom_fields?.find((f: any) =>
        f.label.toUpperCase().includes('COMMISSION FROM PROFIT')
      )
      if (existingCommPct && existingCommPct.value && parseFloat(existingCommPct.value) > 0) {
        commissionPct = parseFloat(existingCommPct.value)
      }
    }
    if (!commissionPct) commissionPct = 50 // default 50%

    const salesCommission = profit > 0 ? profit * (commissionPct / 100) : 0

    console.log(`\n=== Processing Quote ${estimate.estimate_number} ===`)
    console.log(`  Customer: ${estimate.customer_name}`)
    console.log(`  Salesperson: ${salespersonName || 'N/A'}`)
    console.log(`  Sub Total: $${subTotal.toFixed(2)}`)
    console.log(`  Dead Cost Subject to VIG: $${deadCostSubjectToVig.toFixed(2)}`)
    console.log(`  Dead Cost No VIG: $${deadCostNoVig.toFixed(2)}`)
    console.log(`  Dead Cost Total: $${deadCostTotal.toFixed(2)}`)
    console.log(`  VIG Rate: ${vigRate}x`)
    console.log(`  Dead Cost Plus VIG: $${deadCostPlusVig.toFixed(2)}`)
    console.log(`  CC Fees: $${ccFees.toFixed(2)}`)
    console.log(`  Additional Costs: $${additionalCosts.toFixed(2)}`)
    console.log(`  Insurance: $${insurance.toFixed(2)}`)
    console.log(`  Profit: $${profit.toFixed(2)} (${marginPercent.toFixed(1)}%)`)
    console.log(`  Dead Profit Actual: $${deadProfitActual.toFixed(2)}`)
    console.log(`  Commission %: ${commissionPct}%`)
    console.log(`  Sales Commission: $${salesCommission.toFixed(2)}`)

    // 8. Build custom field updates — only update fields that changed
    const existingFields = estimate.custom_fields || []
    const fieldsToUpdate: any[] = []

    const fieldMap: Record<string, any> = {
      'DEAD COST TOTAL': deadCostTotal.toFixed(2),
      'DEAD COST SUBJECT TO VIG': deadCostSubjectToVig.toFixed(2),
      'DEAD COST NO VIG': deadCostNoVig.toFixed(2),
      'SALESPERSON VIG': vigRate,
      'DEAD COST PLUS VIG': deadCostPlusVig.toFixed(2),
      'PROFIT': profit.toFixed(2),
      'COMMISSION FROM PROFIT %': commissionPct,
      'SALES COMMISSION': salesCommission.toFixed(2),
      'ITEMS DC BREAKDOWN': finalBreakdown.join('\n'),
    }

    // Also map by api_name for cf_dead_profit_actual (label may vary)
    const apiNameMap: Record<string, any> = {
      'cf_dead_profit_actual': deadProfitActual.toFixed(2),
    }

    let changesDetected = 0
    for (const [label, value] of Object.entries(fieldMap)) {
      const field = existingFields.find((f: any) => f.label.toUpperCase().trim() === label)
      if (field) {
        const existingVal = String(field.value || '').trim()
        const newVal = String(value).trim()
        if (existingVal !== newVal) {
          fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
          changesDetected++
        }
      } else {
        console.warn(`Custom field "${label}" not found on estimate`)
      }
    }

    // Match by api_name for fields that may have varying labels
    for (const [apiName, value] of Object.entries(apiNameMap)) {
      const field = existingFields.find((f: any) => f.api_name === apiName)
      if (field) {
        const existingVal = String(field.value || '').trim()
        const newVal = String(value).trim()
        if (existingVal !== newVal) {
          // Avoid duplicates if already added by label match
          if (!fieldsToUpdate.some((f: any) => f.customfield_id === field.customfield_id)) {
            fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
            changesDetected++
          }
        }
      } else {
        console.warn(`Custom field api_name "${apiName}" not found on estimate`)
      }
    }

    // 9. Write to Zoho Books — only if there are actual changes
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
      markProcessed(booksEstimateId) // Set loop guard BEFORE the PUT

      const putRes = await fetch(`${baseUrl}/estimates/${booksEstimateId}?organization_id=${ORG_ID}`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ custom_fields: fieldsToUpdate })
      })
      const putData: any = await putRes.json()
      zohoUpdateResult = { ok: putRes.ok, code: putData.code, message: putData.message }

      if (!putRes.ok || putData.code !== 0) {
        console.error("Zoho Books update failed:", JSON.stringify(putData))
      } else {
        console.log(`✅ Updated ${fieldsToUpdate.length} custom fields on quote ${estimate.estimate_number} (${changesDetected} changed)`)
      }
    } else {
      console.log(`⏭️ No changes detected for quote ${estimate.estimate_number} — skipping PUT`)
    }

    // 10. Update local DB
    const localQuote = await prisma.quote.findFirst({
      where: {
        OR: [
          { items: { path: ['estimateNumber'], equals: estimate.estimate_number } },
          { zohoId: booksEstimateId }
        ]
      }
    })

    if (localQuote) {
      const currentItems = (localQuote.items as any) || {}
      await prisma.quote.update({
        where: { id: localQuote.id },
        data: {
          items: {
            ...currentItems,
            deadCostTotal,
            deadCostSubjectToVig,
            deadCostNoVig,
            deadCostPlusVig,
            deadProfitActual,
            profit,
            commission: salesCommission,
            commissionPercent: commissionPct,
            vigRate,
            custom_fields: existingFields,
          }
        }
      })
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        quote: {
          estimateNumber: estimate.estimate_number,
          booksEstimateId,
          customerName: estimate.customer_name,
          salesperson: salespersonName,
          subTotal,
          deadCostSubjectToVig,
          deadCostNoVig,
          deadCostTotal,
          vigRate,
          deadCostPlusVig,
          ccFees,
          additionalCosts,
          insurance,
          deadProfitActual,
          profit,
          marginPercent: parseFloat(marginPercent.toFixed(1)),
          commissionPercent: commissionPct,
          salesCommission,
          lineItems: lineItemDetails,
          itemsDcBreakdown: lineItemBreakdown,
          fieldsUpdated: fieldsToUpdate.length,
          changesDetected,
          zohoUpdateResult
        }
      })
    }

  } catch (err: any) {
    console.error("process-quote-costs error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
