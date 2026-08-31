import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "./lib/zoho-auth"
import { calculateDocumentCosts, buildFieldsToUpdate } from "./lib/cost-calculations"
import { getSystemSettings } from "./lib/settings"
import {
  detectConflict,
  syncInvoicePayments,
  updateInvoiceRecord,
} from "../../src/lib/sync-engine"

import { prisma } from "./lib/prisma"
import { authorizeCostProcessing, hasPrivilegedCostOptions } from "./lib/document-access"
const ORG_ID = ZOHO_ORGANIZATION_ID

let invoiceFieldDefinitionsCache: { expiresAt: number; fields: any[] } | null = null

async function getInvoiceFieldDefinitions(baseUrl: string, authHeaders: Record<string, string>): Promise<any[]> {
  if (invoiceFieldDefinitionsCache && invoiceFieldDefinitionsCache.expiresAt > Date.now()) {
    return invoiceFieldDefinitionsCache.fields
  }

  try {
    const response = await fetch(
      `${baseUrl}/settings/fields?organization_id=${ORG_ID}&entity=invoice&filter_custom_fields=true&skip_inactive_fields=true`,
      { signal: AbortSignal.timeout(15000), headers: authHeaders },
    )
    const data: any = await response.json()
    if (!response.ok || data.code !== 0) {
      throw new Error(data.message || `HTTP ${response.status}`)
    }

    const fields = (data.fields || []).filter((field: any) =>
      field.is_custom_field !== false && field.is_active !== false
    )
    invoiceFieldDefinitionsCache = {
      fields,
      expiresAt: Date.now() + 10 * 60_000,
    }
    return fields
  } catch (error: any) {
    console.warn(`[process-invoice-costs] Could not load invoice custom-field definitions: ${error.message}`)
    return []
  }
}

// ── Loop Guard ──
// Prevents re-entry when our PUT triggers a Zoho workflow that calls back
const recentlyProcessed = new Map<string, number>()
const LOOP_GUARD_TTL = 60_000 // 60 seconds
const TRUSTED_SYSTEM_COST_REQUEST = Symbol("trusted-system-cost-request")

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

export const internalHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const trustedSystemRequest = (event as any)[TRUSTED_SYSTEM_COST_REQUEST] === true
    const sessionUser = trustedSystemRequest
      ? { userId: "system", dbId: "system", role: "ADMIN" }
      : await authenticateFunction(event)
    const body = JSON.parse(event.body || "{}")
    const { invoiceNumber, invoiceId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard, applyTariff } = body

    if (skipLoopGuard) {
      const appSettings = await getSystemSettings(prisma)
      if (appSettings.pause_mass_zoho_updates) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Mass Zoho updates are currently PAUSED in System Settings to conserve API calls." }) }
      }
    }

    if (!invoiceNumber && !invoiceId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing invoiceNumber or invoiceId" }) }
    }

    const access = await authorizeCostProcessing(sessionUser, "invoice", { id: invoiceId, number: invoiceNumber })
    if (!access.authorized) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only process invoices belonging to your accounts" }) }
    }
    if (!access.administrator && hasPrivilegedCostOptions(body)) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Manual cost overrides require an administrator" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Resolve Zoho Books invoice ID
    let booksInvoiceId = invoiceId
    if (!booksInvoiceId && invoiceNumber) {
      const searchRes = await fetch(`${baseUrl}/invoices?organization_id=${ORG_ID}&invoice_number=${invoiceNumber}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
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
    const detailRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch invoice details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const invoice = detailData.invoice

    // 3b. Tariff Logic: If unpaid, applyTariff is true, and no tariff exists (and remove tariff is false), calculate tariff
    const isPaidInvoice = invoice.status?.toLowerCase() === 'paid' || invoice.balance === 0 || parseFloat(invoice.balance || 0) <= 0
    let shouldAddTariff = false
    let tariffAmount = 0
    if (applyTariff && !isPaidInvoice) {
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

    // 5. Draft guard — Draft invoices often don't have purchase_rate yet.
    // Still persist the calculation locally so every imported invoice has a
    // complete snapshot, but do not publish misleading zero-cost fields to Zoho.
    const isDraftInvoice = (invoice.status || "").toLowerCase() === "draft"
    const suppressDraftZohoCosts = isDraftInvoice && deadCostTotal === 0
    if (suppressDraftZohoCosts) {
      console.log(`⏭️  Draft invoice ${invoice.invoice_number} has no purchase costs — saving locally without a Zoho cost PUT`)
    }

    // 6. Build custom field updates — only fields that changed
    const configuredFields = suppressDraftZohoCosts
      ? []
      : await getInvoiceFieldDefinitions(baseUrl, authHeaders)
    const fieldsToUpdate = suppressDraftZohoCosts
      ? []
      : buildFieldsToUpdate(calc, invoice, "invoices", configuredFields)
    const changesDetected = fieldsToUpdate.length

    // 7. PUT to Zoho Books — only if changes exist
    let zohoUpdateResult: any = null
    const putPayload: any = {}
    if (fieldsToUpdate.length > 0) {
      putPayload.custom_fields = fieldsToUpdate
    }
    if (shouldAddTariff) {
      putPayload.adjustment = tariffAmount
      putPayload.adjustment_description = "TARIFF SURCHARGE"
      // Zoho requires a reason when modifying a sent invoice.
      putPayload.reason = "Applied 12.5% tariff surcharge and recalculated invoice costs"
    }

    if (Object.keys(putPayload).length > 0) {
      markProcessed(booksInvoiceId)
      const putRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json", "x-source": "app-cost-sync" },
        body: JSON.stringify(putPayload),
      })
      const putData: any = await putRes.json()
      zohoUpdateResult = { ok: putRes.ok, code: putData.code, message: putData.message }
      if (!putRes.ok || putData.code !== 0) {
        console.error("Zoho Books update failed:", JSON.stringify(putData))
        throw new Error(`Zoho Books update failed (${putData.code ?? putRes.status}): ${putData.message || "Unknown error"}`)
      } else {
        console.log(`✅ Updated invoice ${invoice.invoice_number} in Zoho`)
      }
    } else {
      console.log(`Skip: No changes for invoice ${invoice.invoice_number} — skipping PUT`)
    }

    // 7. Update local DB — with conflict detection, payment enrichment, full snapshot
    const localInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { zohoId: booksInvoiceId },
          { items: { path: ["invoiceNumber"], equals: invoice.invoice_number } },
          { items: { path: ["booksInvoiceId"], equals: booksInvoiceId } },
        ],
      },
    })

    if (localInvoice) {
      // 7a. Conflict detection
      const conflictResult = detectConflict(
        {
          lastSyncedAt:    localInvoice.lastSyncedAt,
          appModifiedAt:   localInvoice.appModifiedAt,
          zohoModifiedTime: localInvoice.zohoModifiedTime,
          items:           localInvoice.items,
        },
        invoice
      )
      if (conflictResult.hasConflict) {
        console.warn(`⚠️  Conflict detected on invoice ${invoice.invoice_number}:`, Object.keys(conflictResult.fields))
      }

      // 7b. Sync payments into Payment table
      const paymentSummary = await syncInvoicePayments(booksInvoiceId, localInvoice.id)
      console.log(`  Payments synced: ${paymentSummary.paymentCount} records | paid=$${paymentSummary.paymentMade.toFixed(2)}`)

      // 7c. Write full enriched record
      const calcItems = {
        sub_total: subTotal, subTotal,
        deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
        deadProfitActual, profit,
        commission: salesCommission, commissionPercent: commissionPct, vigRate,
        lineItemDetails,
        itemsDcBreakdown: lineItemBreakdownStrings,
        actualShippingCost: calc.actualShippingCost,
        shippingCostBreakdown: calc.shippingCostBreakdown,
        shippingRollup: calc.shippingRollup,
        costsCalculatedAt: new Date().toISOString(),
        ...(isPaid && !(localInvoice.items as any)?.paidInFullDate
          ? { paidInFullDate: new Date().toISOString().split("T")[0] }
          : {}),
      }

      await updateInvoiceRecord({
        localId:        localInvoice.id,
        zohoDoc:        invoice,
        calcItems,
        conflictResult,
        paymentSummary: {
          ...paymentSummary,
          paymentExpected: parseFloat(invoice.payment_expected ?? "0") || null,
          balance:         parseFloat(invoice.balance ?? "0") ?? null,
        },
      })
    } else {
      // No local record found — try to create one so this invoice joins the system.
      // Look up the account by Zoho customer_id (which maps to Account.zohoId in CRM).
      console.warn(`[process-invoice-costs] No local record for invoice ${invoice.invoice_number} — attempting upsert`)

      try {
        const account = invoice.customer_id
          ? await prisma.account.findFirst({
              where: {
                OR: [
                  { zohoId: invoice.customer_id },
                  { zohoId: invoice.customer_id?.toString() },
                ],
              },
              select: { id: true },
            })
          : null

        if (account) {
          const zStatus = (invoice.status || "").toLowerCase()
          const mappedStatus =
            zStatus === "paid" || invoice.balance === 0 ? "Paid"
            : zStatus === "void" || zStatus === "voided" ? "Void"
            : zStatus === "draft" ? "Draft"
            : zStatus === "overdue" ? "Overdue"
            : "Sent"

          const newInvoice = await prisma.invoice.upsert({
            where: { zohoId: booksInvoiceId },
            update: {
              status:          mappedStatus,
              amount:          parseFloat(invoice.sub_total ?? "0") || 0,
              zohoModifiedTime: invoice.last_modified_time ? new Date(invoice.last_modified_time) : null,
              items: {
                booksInvoiceId,
                invoiceNumber:    invoice.invoice_number,
                customer_name:    invoice.customer_name,
                salesperson:      invoice.salesperson_name?.toUpperCase().trim() || null,
                sub_total:        parseFloat(invoice.sub_total ?? "0") || 0,
                balance:          parseFloat(invoice.balance ?? "0") || 0,
                line_items:       invoice.line_items || [],
                custom_fields:    invoice.custom_fields || [],
              },
            },
            create: {
              zohoId:          booksInvoiceId,
              accountId:       account.id,
              status:          mappedStatus,
              amount:          parseFloat(invoice.sub_total ?? "0") || 0,
              issueDate:       invoice.date ? new Date(invoice.date) : new Date(),
              dueDate:         invoice.due_date ? new Date(invoice.due_date) : null,
              zohoModifiedTime: invoice.last_modified_time ? new Date(invoice.last_modified_time) : null,
              items: {
                booksInvoiceId,
                invoiceNumber:    invoice.invoice_number,
                customer_name:    invoice.customer_name,
                salesperson:      invoice.salesperson_name?.toUpperCase().trim() || null,
                sub_total:        parseFloat(invoice.sub_total ?? "0") || 0,
                balance:          parseFloat(invoice.balance ?? "0") || 0,
                line_items:       invoice.line_items || [],
                custom_fields:    invoice.custom_fields || [],
              },
            },
          })

          console.log(`✅ Upserted invoice ${invoice.invoice_number} → DB id=${newInvoice.id}`)

          // Now write the calculated costs into the newly created record
          const conflictResult = { hasConflict: false, fields: {} }
          const paymentSummary = await syncInvoicePayments(booksInvoiceId, newInvoice.id)
          const calcItems = {
            sub_total: subTotal, subTotal,
            deadCostTotal, deadCostSubjectToVig, deadCostNoVig, deadCostPlusVig,
            deadProfitActual, profit,
            commission: salesCommission, commissionPercent: commissionPct, vigRate,
            lineItemDetails,
            itemsDcBreakdown: lineItemBreakdownStrings,
          actualShippingCost: calc.actualShippingCost,
          shippingCostBreakdown: calc.shippingCostBreakdown,
          shippingRollup: calc.shippingRollup,
            costsCalculatedAt: new Date().toISOString(),
          }
          await updateInvoiceRecord({
            localId:        newInvoice.id,
            zohoDoc:        invoice,
            calcItems,
            conflictResult,
            paymentSummary: {
              ...paymentSummary,
              paymentExpected: parseFloat(invoice.payment_expected ?? "0") || null,
              balance:         parseFloat(invoice.balance ?? "0") ?? null,
            },
          })
          console.log(`✅ Costs written for auto-created invoice ${invoice.invoice_number}`)
        } else {
          console.warn(`[process-invoice-costs] No matching Account for customer_id=${invoice.customer_id} — invoice ${invoice.invoice_number} not added to DB. Run a full CRM sync first.`)
        }
      } catch (upsertErr: any) {
        console.error(`[process-invoice-costs] Upsert failed for ${invoice.invoice_number}:`, upsertErr.message)
      }
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
          // Sync state
          paymentMade:   parseFloat(invoice.payment_made ?? "0") || 0,
          balance:       parseFloat(invoice.balance ?? "0") ?? null,
        },
      }),
    }
  } catch (err: any) {
    console.error("process-invoice-costs error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

/**
 * Process one invoice from trusted server-side workflows without fabricating a
 * user cookie. The unexported Symbol cannot be supplied over HTTP.
 */
export async function processInvoiceCostsForSystem(
  invoiceId: string,
  options: {
    invoiceNumber?: string
    skipLoopGuard?: boolean
    applyTariff?: boolean
    vigRate?: number
    commissionPercent?: number
    noVigOverrides?: Record<string, boolean>
  } = {}
) {
  return internalHandler({
    httpMethod: "POST",
    body: JSON.stringify({
      invoiceId,
      invoiceNumber: options.invoiceNumber,
      skipLoopGuard: options.skipLoopGuard,
      applyTariff: options.applyTariff,
      vigRate: options.vigRate,
      commissionPercent: options.commissionPercent,
      noVigOverrides: options.noVigOverrides,
    }),
    [TRUSTED_SYSTEM_COST_REQUEST]: true,
  } as any, {} as any)
}

export const handler = withFunctionAuth(internalHandler)
