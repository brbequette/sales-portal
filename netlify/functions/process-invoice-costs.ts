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

function isRecentlyProcessed(invoiceId: string): boolean {
  const lastTime = recentlyProcessed.get(invoiceId)
  if (lastTime && Date.now() - lastTime < LOOP_GUARD_TTL) return true
  return false
}

function markProcessed(invoiceId: string) {
  recentlyProcessed.set(invoiceId, Date.now())
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
    const { invoiceNumber, invoiceId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard } = body

    if (!invoiceNumber && !invoiceId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing invoiceNumber or invoiceId" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Find the invoice in Zoho Books
    let booksInvoiceId = invoiceId
    if (!booksInvoiceId && invoiceNumber) {
      const searchRes = await fetch(`${baseUrl}/invoices?organization_id=${ORG_ID}&invoice_number=${invoiceNumber}`, { headers: authHeaders })
      if (!searchRes.ok) throw new Error(`Failed to search for invoice: ${searchRes.status}`)
      const searchData: any = await searchRes.json()
      if (!searchData.invoices || searchData.invoices.length === 0) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Invoice ${invoiceNumber} not found in Zoho Books` }) }
      }
      booksInvoiceId = searchData.invoices[0].invoice_id
    }

    // ── Loop Guard Check ──
    if (!skipLoopGuard && isRecentlyProcessed(booksInvoiceId)) {
      console.log(`Loop guard: Skipping invoice ${booksInvoiceId} — processed within last ${LOOP_GUARD_TTL / 1000}s`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, skipped: true, reason: 'Loop guard — recently processed' }) }
    }

    // 2. Fetch full invoice details
    const detailRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch invoice details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const invoice = detailData.invoice

    // 3. Calculate Dead Costs from line items
    // Gift items: their purchase_rate is included in dead costs (NO VIG bucket)
    // Regular items: purchase_rate goes to Subject to VIG or No VIG based on checkbox
    let deadCostSubjectToVig = 0
    let deadCostNoVig = 0
    const lineItemBreakdown: string[] = []
    const lineItemDetails: any[] = []

    for (const item of (invoice.line_items || [])) {
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
    const salespersonName = invoice.salesperson_name

    if (!vigRate) {
      const existingVig = invoice.custom_fields?.find((f: any) =>
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
              const invDate = invoice.date || invoice.created_time
              const monthKey = invDate ? new Date(invDate).toISOString().substring(0, 7) : new Date().toISOString().substring(0, 7)
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
    const subTotal = parseFloat(invoice.sub_total || 0)

    const ccFeesField = invoice.custom_fields?.find((f: any) => f.label.toUpperCase().includes('CREDIT CARD PROCESSING'))
    const additionalCostsField = invoice.custom_fields?.find((f: any) => f.label.toUpperCase().includes('ADDITIONAL COSTS SEE'))
    const insuranceField = invoice.custom_fields?.find((f: any) => f.label.toUpperCase() === 'INSURANCE')

    const ccFees = ccFeesField ? parseFloat(ccFeesField.value || 0) : 0
    const additionalCosts = additionalCostsField ? parseFloat(additionalCostsField.value || 0) : 0
    const insurance = insuranceField ? parseFloat(insuranceField.value || 0) : 0

    const totalDeductions = deadCostPlusVig + ccFees + additionalCosts + insurance
    const profit = subTotal - totalDeductions
    const marginPercent = subTotal > 0 ? (profit / subTotal) * 100 : 0

    // 7. Calculate Commission
    let commissionPct = manualCommPct
    if (!commissionPct) {
      const existingCommPct = invoice.custom_fields?.find((f: any) =>
        f.label.toUpperCase().includes('COMMISSION FROM PROFIT')
      )
      if (existingCommPct && existingCommPct.value && parseFloat(existingCommPct.value) > 0) {
        commissionPct = parseFloat(existingCommPct.value)
      }
    }
    if (!commissionPct) commissionPct = 50 // default 50%

    const salesCommission = profit > 0 ? profit * (commissionPct / 100) : 0

    // 8. Check for Paid In Full Date
    const isPaid = invoice.status === 'paid' || parseFloat(invoice.balance || 0) <= 0
    const existingPaidDate = invoice.custom_fields?.find((f: any) => f.label.toUpperCase().includes('PAID IN FULL DATE'))

    console.log(`\n=== Processing Invoice ${invoice.invoice_number} ===`)
    console.log(`  Customer: ${invoice.customer_name}`)
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
    console.log(`  Commission %: ${commissionPct}%`)
    console.log(`  Sales Commission: $${salesCommission.toFixed(2)}`)
    console.log(`  Paid: ${isPaid}`)

    // 9. Build custom field updates — only update fields that changed
    const existingFields = invoice.custom_fields || []
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

    // Add PAID IN FULL DATE if paid and not already set
    if (isPaid && existingPaidDate && !existingPaidDate.value) {
      fieldMap['PAID IN FULL DATE'] = new Date().toISOString().split('T')[0]
    }

    let changesDetected = 0
    for (const [label, value] of Object.entries(fieldMap)) {
      const field = existingFields.find((f: any) => f.label.toUpperCase().trim() === label)
      if (field) {
        // Compare values — skip if unchanged (prevents unnecessary PUTs)
        const existingVal = String(field.value || '').trim()
        const newVal = String(value).trim()
        if (existingVal !== newVal) {
          fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
          changesDetected++
        }
      } else {
        console.warn(`Custom field "${label}" not found on invoice`)
      }
    }

    // 10. Write to Zoho Books — only if there are actual changes
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
      markProcessed(booksInvoiceId) // Set loop guard BEFORE the PUT

      const putRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
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
        console.log(`✅ Updated ${fieldsToUpdate.length} custom fields on invoice ${invoice.invoice_number} (${changesDetected} changed)`)
      }
    } else {
      console.log(`⏭️ No changes detected for invoice ${invoice.invoice_number} — skipping PUT`)
    }

    // 11. Update local DB
    const localInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { items: { path: ['invoiceNumber'], equals: invoice.invoice_number } },
          { items: { path: ['booksInvoiceId'], equals: booksInvoiceId } }
        ]
      }
    })

    if (localInvoice) {
      const currentItems = (localInvoice.items as any) || {}
      await prisma.invoice.update({
        where: { id: localInvoice.id },
        data: {
          items: {
            ...currentItems,
            deadCostTotal,
            deadCostSubjectToVig,
            deadCostNoVig,
            deadCostPlusVig,
            profit,
            commission: salesCommission,
            commissionPercent: commissionPct,
            vigRate,
            custom_fields: existingFields,
            ...(isPaid && !currentItems.paidInFullDate ? { paidInFullDate: new Date().toISOString().split('T')[0] } : {})
          }
        }
      })
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        invoice: {
          invoiceNumber: invoice.invoice_number,
          booksInvoiceId,
          customerName: invoice.customer_name,
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
    console.error("process-invoice-costs error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
