import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getZohoAccessToken } from '../../../../../netlify/functions/lib/zoho-auth'
import { calculateDocumentCosts } from '../../../../../netlify/functions/lib/cost-calculations'
import { getSystemSettings } from '../../../../../netlify/functions/lib/settings'

const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

export async function POST(req: Request) {
  try {
    const appSettings = await getSystemSettings(prisma)
    if (appSettings.pause_mass_zoho_updates) {
      return NextResponse.json({ success: false, error: "Mass Zoho updates are PAUSED in System Settings to conserve API calls." }, { status: 403 })
    }

    // Find up to 10 invoices missing cost or commission data in the database (regardless of status)
    const allMissingCount = await prisma.invoice.count({
      where: {
        OR: [
          { items: { equals: Prisma.DbNull } },
          { items: { path: ['deadCostTotal'], equals: Prisma.DbNull } },
          { items: { path: ['deadCostTotal'], equals: 0 } },
          { items: { path: ['profit'], equals: Prisma.DbNull } },
          { items: { path: ['commission'], equals: Prisma.DbNull } }
        ]
      }
    })

    const missingInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { items: { equals: Prisma.DbNull } },
          { items: { path: ['deadCostTotal'], equals: Prisma.DbNull } },
          { items: { path: ['deadCostTotal'], equals: 0 } },
          { items: { path: ['profit'], equals: Prisma.DbNull } },
          { items: { path: ['commission'], equals: Prisma.DbNull } }
        ]
      },
      orderBy: { issueDate: 'desc' }, // prioritize recent invoices
      take: 10
    })

    if (missingInvoices.length === 0) {
      return NextResponse.json({ success: true, processedCount: 0, remainingCount: 0, message: "All invoices are fully up to date." })
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    const results = []
    
    for (const localInv of missingInvoices) {
      try {
        const booksInvoiceId = localInv.zohoId
        
        // Fetch invoice details from Zoho
        const detailRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { headers: authHeaders })
        if (!detailRes.ok) {
          console.error(`Failed to fetch details for invoice ${localInv.zohoId}: ${detailRes.status}`)
          continue
        }
        const detailData: any = await detailRes.ok && await detailRes.json()
        if (!detailData || detailData.code !== 0) {
          console.error(`Zoho Books error for invoice ${localInv.zohoId}: ${detailData?.message || 'unknown'}`)
          continue
        }
        const invoice = detailData.invoice

        // Tariff Logic: If unpaid and no tariff exists (and remove tariff is false), calculate tariff
        const isPaidInvoice = invoice.status?.toLowerCase() === 'paid' || invoice.balance === 0 || parseFloat(invoice.balance || 0) <= 0
        let shouldAddTariff = false
        let tariffAmount = 0
        if (!isPaidInvoice) {
          const existingAdjustment = parseFloat(invoice.adjustment || 0)
          const removeTariff = invoice.custom_fields?.some((f: any) => f.label?.toUpperCase().includes('REMOVE TARIFF') && (f.value === true || f.value === 'true'))
          if (existingAdjustment === 0 && !removeTariff) {
            let nonGiftDeadCost = 0
            for (const item of (invoice.line_items || [])) {
              const isGift = item.rate === 0 || item.custom_fields?.some((cf: any) => cf.label?.toUpperCase().includes('GIFT') && (cf.value === true || cf.value === 'true'))
              if (!isGift) {
                nonGiftDeadCost += parseFloat(item.purchase_rate || 0) * parseFloat(item.quantity || 1)
              }
            }
            tariffAmount = parseFloat((nonGiftDeadCost * 0.125).toFixed(2))
            if (tariffAmount > 0) {
              shouldAddTariff = true
              invoice.adjustment = tariffAmount
              invoice.adjustment_description = "TARIFF SURCHARGE"
            }
          }
        }

        // Recalculate costs
        const calc = await calculateDocumentCosts(invoice, {})
        const {
          deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig,
          ccFees, additionalCosts, insurance,
          subTotal, profit, marginPercent, deadProfitActual,
          commissionPct, salesCommission, isPaid,
          lineItemDetails, lineItemBreakdownStrings
        } = calc

        // Push updates to Zoho Books
        const existingFields = invoice.custom_fields || []
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

        for (const [label, value] of Object.entries(fieldMap)) {
          const field = existingFields.find((f: any) => f.label.toUpperCase().trim() === label)
          if (field && String(field.value || "").trim() !== String(value).trim()) {
            fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
          }
        }
        for (const [apiName, value] of Object.entries(apiNameMap)) {
          const field = existingFields.find((f: any) => f.api_name === apiName)
          if (field && String(field.value || "").trim() !== String(value).trim()) {
            if (!fieldsToUpdate.some((f: any) => f.customfield_id === field.customfield_id)) {
              fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
            }
          }
        }

        const putPayload: any = {}
        if (fieldsToUpdate.length > 0) {
          putPayload.custom_fields = fieldsToUpdate
        }
        if (shouldAddTariff) {
          putPayload.adjustment = tariffAmount
          putPayload.adjustment_description = "TARIFF SURCHARGE"
        }

        if (Object.keys(putPayload).length > 0) {
          const putRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
            method: "PUT",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(putPayload),
          })
          const putData: any = await putRes.json()
          if (!putRes.ok || putData.code !== 0) {
            console.error(`Zoho Books update failed for ${invoice.invoice_number}:`, JSON.stringify(putData))
          }
        }

        // Update local database
        const currentItems = (localInv.items as any) || {}
        await prisma.invoice.update({
          where: { id: localInv.id },
          data: {
            items: {
              ...currentItems,
              deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
              deadProfitActual, profit,
              commission: salesCommission, commissionPercent: commissionPct, vigRate,
              lineItemDetails,
              itemsDcBreakdown: lineItemBreakdownStrings,
              custom_fields: existingFields,
            }
          }
        })

        results.push({ invoiceNumber: invoice.invoice_number, success: true })
      } catch (err: any) {
        console.error(`Error processing invoice ID ${localInv.id}:`, err.message)
        results.push({ invoiceId: localInv.zohoId, success: false, error: err.message })
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: results.filter(r => r.success).length,
      remainingCount: Math.max(0, allMissingCount - missingInvoices.length),
      results
    })
  } catch (err: any) {
    console.error("recalculate-missing-costs route error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
