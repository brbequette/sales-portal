import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { Prisma } from "@prisma/client"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { calculateDocumentCosts, buildFieldsToUpdate } from "./lib/cost-calculations"
import { detectConflict, updateSalesOrderRecord } from "../../src/lib/sync-engine"

import { prisma } from "./lib/prisma"
import { authorizeCostProcessing, hasPrivilegedCostOptions } from "./lib/document-access"
const ZOHO_DC = process.env.ZOHO_DC || "com"
const TRUSTED_SYSTEM_COST_REQUEST = Symbol("trusted-system-salesorder-cost-request")

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
    const sessionUser = (event as any)[TRUSTED_SYSTEM_COST_REQUEST]
      ? { role: "ADMIN" }
      : await authenticateFunction(event)
    const body = JSON.parse(event.body || "{}")
    const { salesorderNumber, salesorderId, vigRate: manualVigRate, commissionPercent: manualCommPct, noVigOverrides, skipLoopGuard } = body

    if (!salesorderNumber && !salesorderId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing salesorderNumber or salesorderId" }) }
    }

    const access = await authorizeCostProcessing(sessionUser, "salesOrder", { id: salesorderId, number: salesorderNumber })
    if (!access.authorized) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "You can only process sales orders belonging to your accounts" }) }
    }
    if (!access.administrator && hasPrivilegedCostOptions(body)) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Manual cost overrides require an administrator" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }

    // 1. Resolve Zoho Books sales order ID
    let booksSalesorderId = salesorderId
    if (!booksSalesorderId && salesorderNumber) {
      const searchRes = await fetch(`${baseUrl}/salesorders?organization_id=${ORG_ID}&salesorder_number=${salesorderNumber}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
      if (!searchRes.ok) throw new Error(`Failed to search for sales order: ${searchRes.status}`)
      const searchData: any = await searchRes.json()
      if (!searchData.salesorders?.length) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Sales Order ${salesorderNumber} not found in Zoho Books` }) }
      }
      booksSalesorderId = searchData.salesorders[0].salesorder_id
    }

    // 2. Loop guard
    if (!skipLoopGuard && isRecentlyProcessed(booksSalesorderId)) {
      console.log(`Loop guard: Skipping sales order ${booksSalesorderId}`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, skipped: true, reason: "Loop guard — recently processed" }) }
    }

    // 3. Fetch full sales order
    const detailRes = await fetch(`${baseUrl}/salesorders/${booksSalesorderId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders })
    if (!detailRes.ok) throw new Error(`Failed to fetch sales order details: ${detailRes.status}`)
    const detailData: any = await detailRes.json()
    if (detailData.code !== 0) throw new Error(`Zoho error: ${detailData.message}`)
    const salesorder = detailData.salesorder

    // 3b. Fetch & upsert packages for this sales order (so cost-calculations has live shipping data)
    let packagesFromZoho: any[] = []
    let packageSyncErrors = 0
    try {
      const pkgRes = await fetch(
        `${baseUrl}/salesorders/${booksSalesorderId}/packages?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000), headers: authHeaders }
      )
      if (pkgRes.ok) {
        const pkgData: any = await pkgRes.json()
        if (pkgData.code === 0 && Array.isArray(pkgData.packages)) {
          packagesFromZoho = pkgData.packages
          for (const pkg of packagesFromZoho) {
            const zohoId = pkg.package_id
            if (!zohoId) continue
            const packageData: Prisma.PackageCreateInput = {
              zohoId,
              packageNumber:    pkg.package_number    || null,
              salesOrderId:     booksSalesorderId     || null,
              salesOrderNumber: salesorder.salesorder_number || null,
              date:             pkg.date ? new Date(pkg.date) : null,
              status:           pkg.status            || null,
              carrier:          pkg.delivery_method || pkg.shipping_carrier || null,
              trackingNumber:   pkg.tracking_number   || null,
              shippingCharge:   parseFloat(pkg.shipping_charge || 0),
              items:            pkg.line_items ? { lineItems: pkg.line_items } : Prisma.JsonNull,
            }
            await prisma.package.upsert({
              where:  { zohoId },
              update: packageData as Prisma.PackageUpdateInput,
              create: packageData,
            })
          }
          console.log(`  📦 Synced ${packagesFromZoho.length} package(s) for SO ${salesorder.salesorder_number}`)
        }
      } else {
        console.warn(`  ⚠️  Could not fetch packages for SO ${booksSalesorderId}: HTTP ${pkgRes.status}`)
      }
    } catch (pkgErr: any) {
      console.error(`  Package sync error for SO ${booksSalesorderId}:`, pkgErr.message)
      packageSyncErrors++
    }

    // 4. Calculate all costs via shared module
    const calc = await calculateDocumentCosts(salesorder, { manualVigRate, manualCommPct, noVigOverrides })
    const {
      deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
      vigRate, deadCostPlusVig,
      ccFees, additionalCosts, insurance,
      subTotal, profit, marginPercent, deadProfitActual,
      commissionPct, salesCommission,
      lineItemDetails, lineItemBreakdownStrings,
    } = calc

    const salespersonName = salesorder.salesperson_name
    console.log(`\n=== Processing Sales Order ${salesorder.salesorder_number} ===`)
    console.log(`  Customer: ${salesorder.customer_name} | Rep: ${salespersonName || "N/A"}`)
    console.log(`  SubTotal: $${subTotal.toFixed(2)} | DeadCost: $${deadCostTotal.toFixed(2)} | VIG: ${vigRate}x | Profit: $${profit.toFixed(2)} (${marginPercent.toFixed(1)}%)`)
    console.log(`  Insurance: $${insurance.toFixed(2)} (not deducted) | Commission: $${salesCommission.toFixed(2)}`)

    const fieldsToUpdate = buildFieldsToUpdate(calc, salesorder, "salesorders")
    const changesDetected = fieldsToUpdate.length

    // 6. PUT to Zoho Books — only if changes exist
    let zohoUpdateResult: any = null
    if (fieldsToUpdate.length > 0) {
      markProcessed(booksSalesorderId)
      const putRes = await fetch(`${baseUrl}/salesorders/${booksSalesorderId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ custom_fields: fieldsToUpdate }),
      })
      const putData: any = await putRes.json()
      zohoUpdateResult = { ok: putRes.ok, code: putData.code, message: putData.message }
      if (!putRes.ok || putData.code !== 0) {
        console.error("Zoho Books update failed:", JSON.stringify(putData))
      } else {
        console.log(`✅ Updated ${fieldsToUpdate.length} fields on sales order ${salesorder.salesorder_number} (${changesDetected} changed)`)
      }
    } else {
      console.log(`⏭️ No changes for sales order ${salesorder.salesorder_number} — skipping PUT`)
    }

    // 7. Update local DB — conflict detection + full Zoho snapshot
    const localSalesOrder = await prisma.salesOrder.findFirst({
      where: { OR: [{ items: { path: ["salesOrderNumber"], equals: salesorder.salesorder_number } }, { zohoId: booksSalesorderId }] },
    })
    if (localSalesOrder) {
      const conflictResult = detectConflict(
        {
          lastSyncedAt:     localSalesOrder.lastSyncedAt,
          appModifiedAt:    localSalesOrder.appModifiedAt,
          zohoModifiedTime: localSalesOrder.zohoModifiedTime,
          items:            localSalesOrder.items,
        },
        salesorder
      )
      if (conflictResult.hasConflict) {
        console.warn(`⚠️  Conflict on SO ${salesorder.salesorder_number}:`, Object.keys(conflictResult.fields))
      }

      await updateSalesOrderRecord({
        localId: localSalesOrder.id,
        zohoDoc: salesorder,
        calcItems: {
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
        },
        conflictResult,
      })
    } else {
      console.warn(`[process-salesorder-costs] No local record for SO ${salesorder.salesorder_number}`)
    }


    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        salesorder: {
          salesorderNumber: salesorder.salesorder_number, booksSalesorderId,
          customerName: salesorder.customer_name, salesperson: salespersonName,
          subTotal, deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
          vigRate, deadCostPlusVig, ccFees, additionalCosts, insurance,
          deadProfitActual, profit, marginPercent: parseFloat(marginPercent.toFixed(1)),
          commissionPercent: commissionPct, salesCommission,
          lineItems: lineItemDetails, itemsDcBreakdown: lineItemBreakdownStrings,
          fieldsUpdated: fieldsToUpdate.length, changesDetected, zohoUpdateResult,
          packages: {
            synced: packagesFromZoho.length,
            errors: packageSyncErrors,
            actualShippingCost: calc.actualShippingCost,
            shippingCostBreakdown: calc.shippingCostBreakdown,
          },
        },
      }),
    }
  } catch (err: any) {
    console.error("process-salesorder-costs error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

/** Process one sales order from trusted server-side workflows. */
export async function processSalesOrderCostsForSystem(
  salesorderId: string,
  salesorderNumber?: string,
  options: {
    skipLoopGuard?: boolean
    vigRate?: number
    commissionPercent?: number
    noVigOverrides?: Record<string, boolean>
  } = {}
) {
  return internalHandler({
    httpMethod: "POST",
    // Prefer the immutable business document number when available. Local
    // Zoho IDs can become stale after a document is recreated in Books.
    body: JSON.stringify({
      ...(salesorderNumber ? { salesorderNumber } : {}),
      salesorderId,
      skipLoopGuard: options.skipLoopGuard,
      vigRate: options.vigRate,
      commissionPercent: options.commissionPercent,
      noVigOverrides: options.noVigOverrides,
    }),
    [TRUSTED_SYSTEM_COST_REQUEST]: true,
  } as any, {} as any)
}

/**
 * Process one sales order for the sync pipeline (webhook receiver / daily
 * sync). Persists calculated costs to the local database immediately so page
 * reads stay DB-only.
 */
export async function processSalesOrderCostsForPipeline(
  salesorderId: string,
  salesorderNumber?: string,
  options: {
    skipLoopGuard?: boolean
    vigRate?: number
    commissionPercent?: number
    noVigOverrides?: Record<string, boolean>
  } = {}
) {
  return processSalesOrderCostsForSystem(salesorderId, salesorderNumber, options)
}

export const handler = withFunctionAuth(internalHandler)
