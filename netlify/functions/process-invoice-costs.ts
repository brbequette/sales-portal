import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

// Determine if a line item should NOT have VIG applied.
// VIG is removed when:
//   1. The item is flagged as a gift
//   2. The item has a "Subject to VIG" checkbox that is unchecked (false)
// By default, items ARE subject to VIG.
function isNoVigItem(item: any): boolean {
  // 1. Gift items never get VIG
  const name = (item.name || '').toLowerCase()
  const desc = (item.description || '').toLowerCase()
  if (item.is_gift || name.includes('gift') || desc.includes('gift')) {
    return true
  }

  // 2. Check item-level custom fields for a "Subject to VIG" checkbox
  //    If the checkbox exists and is unchecked (false), this item is no-vig
  const customFields = item.item_custom_fields || []
  for (const cf of customFields) {
    const label = (cf.label || '').toUpperCase()
    if (label.includes('SUBJECT TO VIG') || label.includes('VIG') || label.includes('REMOVE VIG')) {
      // "Subject to VIG" checkbox: true = has vig, false = no vig
      if (label.includes('REMOVE') || label.includes('NO VIG')) {
        // "Remove VIG" / "No VIG" checkbox: true = no vig
        return cf.value === true || cf.value === 'true'
      }
      // "Subject to VIG" checkbox: false = no vig
      return cf.value === false || cf.value === 'false' || cf.value === ''
    }
  }

  return false // default: item IS subject to VIG
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
    const { invoiceNumber, invoiceId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides } = body

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

    // 2. Fetch full invoice details
    const detailRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch invoice details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const invoice = detailData.invoice

    // 3. Calculate Dead Costs from line items
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

      // Determine if this item is no-vig (user overrides take priority)
      let noVig = isNoVigItem(item)
      if (noVigOverrides && item.line_item_id && noVigOverrides[item.line_item_id] !== undefined) {
        noVig = noVigOverrides[item.line_item_id]
      }

      if (noVig) {
        deadCostNoVig += itemDeadCost
      } else {
        deadCostSubjectToVig += itemDeadCost
      }

      lineItemBreakdown.push(`${item.name}: ${qty}x @ $${cost.toFixed(2)} = $${itemDeadCost.toFixed(2)}${noVig ? ' [NO VIG]' : ''}`)
      lineItemDetails.push({
        name: item.name,
        sku: item.sku || null,
        quantity: qty,
        rate,
        cost,
        itemTotal,
        deadCost: itemDeadCost,
        noVig
      })
    }

    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig

    // 4. Determine VIG rate
    let vigRate = manualVigRate || null
    const salespersonName = invoice.salesperson_name

    if (!vigRate) {
      // Check existing custom field value first
      const existingVig = invoice.custom_fields?.find((f: any) =>
        f.label.toUpperCase().includes('SALESPERSON VIG') || f.api_name === 'cf_salesperson_vig'
      )
      if (existingVig && existingVig.value && parseFloat(existingVig.value) > 0) {
        vigRate = parseFloat(existingVig.value)
      }
    }

    if (!vigRate && salespersonName) {
      // Look up VIG from settings
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
              // Use invoice date month for VIG lookup
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
    // Dead Cost Plus VIG = (Dead Cost Subject to VIG × VIG) + Dead Cost No VIG
    const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig

    // 6. Calculate Profit = Sub_Total - Dead Cost Plus VIG
    const subTotal = parseFloat(invoice.sub_total || 0)

    // Check for additional costs from custom fields
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
    // Commission % — use manual override, existing field, or default 50%
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

    // 8. Build custom field updates by matching label names
    const existingFields = invoice.custom_fields || []
    const fieldsToUpdate: any[] = []

    const fieldMap: Record<string, any> = {
      'DEAD COST TOTAL': deadCostTotal,
      'DEAD COST SUBJECT TO VIG': deadCostSubjectToVig,
      'DEAD COST NO VIG': deadCostNoVig,
      'SALESPERSON VIG': vigRate,
      'DEAD COST PLUS VIG': deadCostPlusVig,
      'PROFIT': profit,
      'COMMISSION FROM PROFIT %': commissionPct,
      'SALES COMMISSION': salesCommission,
      'ITEMS DC BREAKDOWN': lineItemBreakdown.join('\n'),
    }

    for (const [label, value] of Object.entries(fieldMap)) {
      const field = existingFields.find((f: any) => f.label.toUpperCase().trim() === label)
      if (field) {
        fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
      } else {
        console.warn(`Custom field "${label}" not found on invoice`)
      }
    }

    // 9. Write to Zoho Books
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
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
        console.log(`✅ Updated ${fieldsToUpdate.length} custom fields on invoice ${invoice.invoice_number}`)
      }
    }

    // 10. Update local DB
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
            custom_fields: existingFields
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
