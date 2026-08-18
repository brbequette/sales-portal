import { Handler } from "@netlify/functions"
import { getStore } from "@netlify/blobs"

import { prisma } from "./lib/prisma"
import { internalHandler as processInvoiceCosts } from "./process-invoice-costs"
import { internalHandler as processQuoteCosts } from "./process-quote-costs"
import { internalHandler as processSalesOrderCosts } from "./process-salesorder-costs"
import {
  extractProfit,
  extractCommissionAmount,
  extractVigRate,
  extractDeadCostTotal,
  extractCcFees,
  extractAdditionalCosts,
  extractInsurance,
  extractActualShippingCost,
  extractShippingCostBreakdown
} from "../../src/lib/custom-field-extractor"

import { corsHeaders, handleOptions } from "./lib/cors"

/**
 * Zoho Books Webhook Receiver (Netlify Function)
 *
 * All 5 Zoho webhooks already point here:
 *   Invoice Sync       → ?type=Invoice
 *   Sales Order Sync   → ?type=SalesOrder
 *   Estimate Sync      → ?type=Quote
 *   Vendor Sync        → ?type=Vendor
 *   Payments           → ?type=Payment
 *
 * Auth: Set ZOHO_WEBHOOK_TOKEN env var in Netlify to match the
 *       x-zoho-webhook-token header value (currently: tdu.webhooks2026).
 *
 * Loop-guard: When this app writes cost fields back to Zoho, Zoho fires
 *   another webhook. We detect this via a custom x-source=app-cost-sync
 *   header and skip the cost recalculation to prevent infinite loops.
 *
 * Sync strategy (Plan B — flag & review):
 *   - Invoices/SOs/Quotes: sets pendingZohoFetch=true and updates the
 *     lastZohoModifiedTime timestamp, then triggers a cost recalculation.
 *     If both app and Zoho changed since last sync, marks syncConflict=true
 *     for admin review instead of overwriting.
 *   - Payments: upsert into Payment table immediately + refresh invoice summary.
 *   - Vendors: upsert into Vendor table immediately.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { type = "Invoice" } = event.queryStringParameters || {}

    // ── Webhook authentication ──────────────────────────────────────────────
    // Supports HMAC-SHA256 signature (preferred) and shared-secret fallback.
    const webhookSecret = process.env.ZOHO_WEBHOOK_TOKEN || process.env.ZOHO_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[zoho-books-webhook] Webhook secret is not configured — rejecting request')
      return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'Webhook is not configured' }) }
    }
    if (webhookSecret) {
      const hmacSignature = event.headers['x-zoho-webhook-signature'] || event.headers['x-webhook-signature'] || ''
      const simpleToken   = event.headers['x-zoho-webhook-token'] || event.headers['x-webhook-token'] || ''

      if (hmacSignature) {
        // HMAC-SHA256 verification (most secure)
        const crypto = await import('crypto')
        const rawBody = event.body || ''
        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
        const suppliedBuffer = Buffer.from(hmacSignature)
        const expectedBuffer = Buffer.from(expected)
        if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
          console.warn('[zoho-books-webhook] HMAC signature mismatch — rejecting request')
          return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
        }
      } else if (simpleToken) {
        // Shared-secret fallback (Zoho Books default)
        if (simpleToken !== webhookSecret) {
          console.warn('[zoho-books-webhook] Token mismatch — rejecting request')
          return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
        }
      } else {
        // NEW-001 fix: if a secret is configured, REQUIRE auth — reject requests with no auth header at all.
        // Zoho Books always sends the configured webhook token/signature; a request with neither is forged.
        console.warn('[zoho-books-webhook] No auth header provided — rejecting request (webhookSecret is configured)')
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
      }
    }

    // Authenticated app write-backs do not need another cost recalculation.
    const isSelfTriggered = (event.headers?.['x-source'] || '').toLowerCase() === 'app-cost-sync'
    if (isSelfTriggered) {
      console.log(`[zoho-books-webhook] Skipping cost recalc — triggered by app write-back (x-source: app-cost-sync)`)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: 'Skipped: app write-back' }) }
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: any = {}
    try {
      body = JSON.parse(event.body || "{}")
    } catch { /* empty body */ }

    // Zoho Books may wrap data in a JSONString field
    if (typeof body.JSONString === "string") {
      try { body = JSON.parse(body.JSONString) } catch { /* ignore */ }
    }

    const doc = body.data || body
    if (!doc) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: "No data to process" }) }
    }

    const booksId = doc.invoice_id || doc.salesorder_id || doc.estimate_id || doc.contact_id || doc.payment_id
    console.log(`[zoho-books-webhook] type=${type} event=${body.event_type || "unknown"} id=${booksId}`)

    if (!booksId) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: "No Books ID in payload" }) }
    }

    // ── Payment webhook ─────────────────────────────────────────────────────
    if (type === "Payment") {
      const paymentId     = doc.payment_id
      const invoicePayments = doc.invoices || []

      await prisma.payment.upsert({
        where: { zohoId: paymentId },
        update: {
          amount:          parseFloat(doc.amount || 0),
          date:            doc.date ? new Date(doc.date) : null,
          mode:            doc.payment_mode || null,
          status:          doc.status || null,
          referenceNumber: doc.reference_number || null,
          bankCharges:     parseFloat(doc.bank_charges || 0),
          invoiceId:       invoicePayments[0]?.invoice_id || null,
          invoiceNumber:   invoicePayments[0]?.invoice_number || null,
        },
        create: {
          zohoId:          paymentId,
          amount:          parseFloat(doc.amount || 0),
          date:            doc.date ? new Date(doc.date) : null,
          mode:            doc.payment_mode || null,
          status:          doc.status || null,
          referenceNumber: doc.reference_number || null,
          bankCharges:     parseFloat(doc.bank_charges || 0),
          invoiceId:       invoicePayments[0]?.invoice_id || null,
          invoiceNumber:   invoicePayments[0]?.invoice_number || null,
        }
      })

      // Update related invoices + set Payment FK
      for (const invPayment of invoicePayments) {
        const invId = invPayment.invoice_id
        if (!invId) continue

        const localInv = await prisma.invoice.findFirst({ where: { zohoId: invId } })
        if (!localInv) continue

        const currentItems = (localInv.items as any) || {}
        const newBalance   = parseFloat(invPayment.balance_after_amount ?? invPayment.balance ?? currentItems.balance ?? 0)
        const isPaid       = newBalance <= 0

        await prisma.invoice.update({
          where: { id: localInv.id },
          data: {
            status:          isPaid ? "Paid" : localInv.status ?? undefined,
            paymentMade:     parseFloat(doc.amount || 0),
            lastPaymentDate: doc.date ? new Date(doc.date) : null,
            balance:         newBalance,
            pendingZohoFetch: true, // flag for next bulk sync to pull full details
            lastZohoModifiedTime: new Date(),
            items: {
              ...currentItems,
              balance:     newBalance,
              paymentDate: isPaid ? (doc.date || new Date().toISOString().split("T")[0]) : currentItems.paymentDate,
            },
          }
        })

        // NEW-006 fix: set invoiceDbId on the Payment record to establish the Prisma FK relation
        await prisma.payment.update({
          where: { zohoId: paymentId },
          data: { invoiceDbId: localInv.id }
        })

        console.log(`✅ Webhook: Updated invoice ${invId} balance=$${newBalance} ${isPaid ? "(PAID)" : ""}`)
      }

      console.log(`✅ Webhook: Upserted Payment ${paymentId} ($${doc.amount})`)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Payment ${paymentId} synced, ${invoicePayments.length} invoice(s) updated` }) }
    }

    // ── Vendor webhook ──────────────────────────────────────────────────────
    if (type === "Vendor" || type === "Contact") {
      if (doc.contact_type !== "vendor") {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: "Contact is not a vendor" }) }
      }

      await prisma.vendor.upsert({
        where: { zohoId: booksId },
        update: {
          contactName:     doc.contact_name,
          companyName:     doc.company_name,
          email:           doc.email,
          phone:           doc.phone,
          currencyId:      doc.currency_id,
          paymentTerms:    doc.payment_terms,
          billingAddress:  doc.billing_address,
          shippingAddress: doc.shipping_address,
          customFields:    doc.custom_fields,
          status:          doc.status
        },
        create: {
          zohoId:          booksId,
          contactName:     doc.contact_name,
          companyName:     doc.company_name,
          email:           doc.email,
          phone:           doc.phone,
          currencyId:      doc.currency_id,
          paymentTerms:    doc.payment_terms,
          billingAddress:  doc.billing_address,
          shippingAddress: doc.shipping_address,
          customFields:    doc.custom_fields,
          status:          doc.status
        }
      })
      console.log(`✅ Webhook: Upserted Vendor ${booksId}`)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Vendor ${booksId} synced` }) }
    }

    // ── Invoice / SalesOrder / Quote ────────────────────────────────────────

    // Find or create the local record
    let dbDoc: any = null
    let isNewRecord = false

    if (type === "Invoice") {
      dbDoc = await prisma.invoice.findFirst({ where: { zohoId: booksId } })
    } else if (type === "SalesOrder") {
      dbDoc = await prisma.salesOrder.findFirst({ where: { zohoId: booksId } })
    } else if (type === "Quote") {
      dbDoc = await prisma.quote.findFirst({ where: { zohoId: booksId } })
    }

    if (!dbDoc) {
      // NEW: Record doesn't exist locally — create it
      console.log(`[zoho-books-webhook] ${type} ${booksId} not in local DB — creating from webhook payload`)

      // Resolve account: find by customer_id (Zoho contact ID) or customer_name
      let accountId: string | null = null
      const customerIdFromZoho = doc.customer_id || doc.contact_id || null
      const customerName = (doc.customer_name || '').trim()

      if (customerIdFromZoho) {
        const account = await prisma.account.findFirst({ where: { zohoId: String(customerIdFromZoho) } })
        if (account) accountId = account.id
      }

      // Fallback: match by name
      if (!accountId && customerName) {
        const account = await prisma.account.findFirst({
          where: { name: { equals: customerName, mode: 'insensitive' } }
        })
        if (account) accountId = account.id
      }

      // If still no account, sync the specific customer from Zoho
      if (!accountId && customerIdFromZoho) {
        try {
          const { getZohoAccessToken, ZOHO_ORGANIZATION_ID } = await import('./lib/zoho-auth')
          const token = await getZohoAccessToken()
          const zohoRes = await fetch(
            `https://www.zohoapis.com/books/v3/contacts/${customerIdFromZoho}?organization_id=${ZOHO_ORGANIZATION_ID}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )
          if (zohoRes.ok) {
            const contactData = await zohoRes.json()
            const contact = contactData.contact || {}
            
            // We need a fallback ownerId for new accounts. Let's find any admin or default user.
            const defaultOwner = await prisma.user.findFirst()
            
            if (defaultOwner) {
              const newAccount = await prisma.account.upsert({
                where: { zohoId: String(customerIdFromZoho) },
                update: { name: contact.contact_name || customerName },
                create: {
                  zohoId: String(customerIdFromZoho),
                  name: contact.contact_name || customerName || 'Unknown',
                  status: 'active',
                  ownerId: defaultOwner.id
                }
              })
              accountId = newAccount.id
              console.log(`[zoho-books-webhook] Synced new account: ${contact.contact_name} (${customerIdFromZoho})`)
            }
          }
        } catch (e: any) {
          console.error(`[zoho-books-webhook] Failed to sync account ${customerIdFromZoho}:`, e.message)
        }
      }

      if (!accountId) {
        console.error(`[zoho-books-webhook] Could not resolve account for ${type} ${booksId}, cannot create record.`)
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Skipping: could not resolve account` }) }
      }

      // Create the document record
      const amount = parseFloat(doc.sub_total || doc.total || '0') || 0
      const issueDate = doc.date ? new Date(doc.date) : new Date()
      const dueDate = doc.due_date ? new Date(doc.due_date) : null
      const now = new Date()

      try {
        if (type === "Invoice") {
          dbDoc = await prisma.invoice.upsert({
            where: { zohoId: booksId },
            update: {},
            create: {
              zohoId: booksId,
              accountId: accountId,
              amount,
              status: doc.status || 'draft',
              issueDate,
              dueDate,
              items: {},
              lastSyncedAt: now,
              appModifiedAt: now,
              lastZohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : now,
            }
          })
        } else if (type === "SalesOrder") {
          dbDoc = await prisma.salesOrder.upsert({
            where: { zohoId: booksId },
            update: {},
            create: {
              zohoId: booksId,
              accountId: accountId,
              amount,
              status: doc.status || 'draft',
              orderDate: issueDate,
              items: {},
              lastSyncedAt: now,
              appModifiedAt: now,
              lastZohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : now,
            }
          })
        } else if (type === "Quote") {
          dbDoc = await prisma.quote.upsert({
            where: { zohoId: booksId },
            update: {},
            create: {
              zohoId: booksId,
              accountId: accountId,
              amount,
              status: doc.status || 'draft',
              items: {},
              lastSyncedAt: now,
              appModifiedAt: now,
              lastZohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : now,
            }
          })
        }
        isNewRecord = true
        console.log(`[zoho-books-webhook] Created new ${type} ${booksId} (account: ${accountId})`)
      } catch (createErr: any) {
        console.error(`[zoho-books-webhook] Failed to create ${type} ${booksId}:`, createErr.message)
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Failed to create ${type}: ${createErr.message}` }) }
      }
    }

    // ── Conflict check (Plan B) ─────────────────────────────────────────────
    // If the app modified this record since the last sync, AND Zoho is also
    // sending an update, flag it for admin review instead of overwriting.
    const lastSynced  = dbDoc.lastSyncedAt?.getTime()  ?? 0
    const appModified = dbDoc.appModifiedAt?.getTime() ?? 0
    const zohoModRaw  = doc.last_modified_time ? new Date(doc.last_modified_time).getTime() : Date.now()
    const appChanged  = appModified > lastSynced && lastSynced > 0
    const zohoChanged = zohoModRaw > lastSynced  && lastSynced > 0

    if (appChanged && zohoChanged) {
      // Both sides changed — flag for manual review, don't overwrite
      console.warn(`⚠️ Conflict: ${type} ${booksId} — both sides changed since last sync. Flagging for review.`)
      const flagData = {
        syncConflict:         true,
        pendingZohoFetch:     true,
        lastZohoModifiedTime: doc.last_modified_time ? new Date(doc.last_modified_time) : new Date(),
      }
      if (type === "Invoice")    await prisma.invoice.update({ where: { id: dbDoc.id }, data: flagData })
      if (type === "SalesOrder") await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: flagData })
      if (type === "Quote")      await prisma.quote.update({ where: { id: dbDoc.id }, data: flagData })

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, conflict: true, message: `${type} ${booksId} flagged for manual conflict review` }) }
    }

    // For Quote/Estimate webhooks: only process estimates that have been converted to an invoice
    if (type === "Quote") {
      const estStatus = (doc.status || "").toLowerCase()
      if (estStatus !== "invoiced") {
        console.log(`Estimate ${booksId} status="${doc.status}" — not invoiced, skipping webhook sync`)
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, message: `Estimate not invoiced (status: ${doc.status}) — skipped` }) }
      }
    }

    // ── Build updated items from webhook payload ──────────────────────────────
    const currentItems = (dbDoc.items as any) || {}
    const cfh = doc.custom_field_hash || {}
    const updatedItems: any = {
      ...currentItems,
      invoiceNumber:          doc.invoice_number    || currentItems.invoiceNumber,
      salesOrderNumber:       doc.salesorder_number || currentItems.salesOrderNumber,
      estimateNumber:         doc.estimate_number   || currentItems.estimateNumber,
      sub_total:              parseFloat(doc.sub_total || currentItems.sub_total || 0),
      total:                  parseFloat(doc.total    || currentItems.total    || 0),
      balance:                doc.balance ?? currentItems.balance ?? 0,
      shippingCharge:         parseFloat(doc.shipping_charge || currentItems.shippingCharge || 0),
      customer_name:          doc.customer_name    || currentItems.customer_name,
      salesperson:            doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : currentItems.salesperson,
      salesorder_salesperson_name: doc.salesperson_name || currentItems.salesorder_salesperson_name,
      reference_number:       doc.reference_number || currentItems.reference_number,
      date:                   doc.date || currentItems.date,
      line_items:             doc.line_items    || currentItems.line_items    || [],
      custom_fields:          doc.custom_fields || currentItems.custom_fields || [],
      custom_field_hash:      cfh,
      paymentDate:            doc.last_payment_date || currentItems.paymentDate,
      booksInvoiceId:         type === "Invoice"    ? booksId : currentItems.booksInvoiceId,
      booksSalesOrderId:      type === "SalesOrder" ? booksId : currentItems.booksSalesOrderId,
      booksEstimateId:        type === "Quote"      ? booksId : currentItems.booksEstimateId,
      // ── Calculated cost fields (from Zoho custom fields) ─────────────────
      profit:              extractProfit(doc)              || currentItems.profit        || 0,
      commission:          extractCommissionAmount(doc)    || currentItems.commission    || 0,
      commissionPercent:   parseFloat(cfh.cf_commision_from_profit_unformatted ?? currentItems.commissionPercent ?? 50) || 50,
      vig:                 extractVigRate(doc)             || currentItems.vig           || 1.3,
      deadCostTotal:       extractDeadCostTotal(doc)       || currentItems.deadCostTotal || 0,
      deadCostSubjectToVig: parseFloat(cfh.cf_dead_cost_subject_to_vig_unformatted ?? currentItems.deadCostSubjectToVig ?? 0) || 0,
      deadCostNoVig:       parseFloat(cfh.cf_dead_cost_no_vig_unformatted          ?? currentItems.deadCostNoVig       ?? 0) || 0,
      deadCostPlusVig:     parseFloat(cfh.cf_dead_cost_with_vig_unformatted        ?? currentItems.deadCostPlusVig     ?? 0) || 0,
      ccFees:              extractCcFees(doc)              || currentItems.ccFees        || 0,
      additionalCosts:     extractAdditionalCosts(doc)     || currentItems.additionalCosts || 0,
      insurance:           extractInsurance(doc)           || currentItems.insurance     || 0,
      actualShippingCost:  extractActualShippingCost(doc)  || currentItems.actualShippingCost || 0,
      shippingCostBreakdown: extractShippingCostBreakdown(doc) || currentItems.shippingCostBreakdown || null,
      // ── Non-calculated user-input fields (preserve from Zoho custom fields)
      estimateNumberRef:         cfh.cf_estimate_number          ?? currentItems.estimateNumberRef    ?? null,
      estimateDate:              cfh.cf_estimate_date            ?? currentItems.estimateDate          ?? null,
      paidInFullDate:            cfh.cf_paid_in_full_date        ?? currentItems.paidInFullDate        ?? null,
      commissionStatus:          cfh.cf_commission_status        ?? currentItems.commissionStatus      ?? null,
      writtenOff:                cfh.cf_written_off              ?? currentItems.writtenOff            ?? false,
      removeTariffSurcharge:     cfh.cf_remove_tariff_surcharge  ?? currentItems.removeTariffSurcharge ?? false,
      additionalCostNotes:       cfh.cf_additional_cost_explanation ?? currentItems.additionalCostNotes ?? null,
      ccBreakdown:               cfh.cf_cc_charge_s_breakdown    ?? currentItems.ccBreakdown           ?? null,
      purchaseOrderNumbers:      cfh.cf_purchase_order_number_s  ?? currentItems.purchaseOrderNumbers  ?? null,
      itemsDcBreakdown:          cfh.cf_dc_breakdown ? [cfh.cf_dc_breakdown] : currentItems.itemsDcBreakdown ?? null,
    }

    // ── Determine status ────────────────────────────────────────────────────
    let status = dbDoc.status
    const zStatus = (doc.status || "").toLowerCase()
    if (zStatus === "paid" || doc.balance === 0 || zStatus === "closed" || zStatus === "invoiced") status = "Paid"
    else if (zStatus === "void" || zStatus === "voided" || zStatus === "declined") status = "Void"
    else if (zStatus === "writeoff" || zStatus === "write_off" || zStatus === "bad debt") status = "Writeoff"
    else if (zStatus === "draft") status = "Draft"
    else if (doc.status) status = doc.status.charAt(0).toUpperCase() + doc.status.slice(1)

    // ── Sync timestamp fields ───────────────────────────────────────────────
    const now         = new Date()
    const zohoModTime = doc.last_modified_time ? new Date(doc.last_modified_time) : now
    const syncFields  = {
      lastZohoModifiedTime: zohoModTime,
      zohoModifiedTime:     zohoModTime,
      lastSyncedAt:         now,
      appModifiedAt:        now,
      pendingZohoFetch:     false,
      syncConflict:         false,
      conflictFields:       undefined as any,
    }

    // ── Write to DB + trigger cost recalculation ────────────────────────────
    if (type === "Invoice") {
      let matchedIssueDate: Date | null = null
      const soNum = (doc.salesorder_number || updatedItems.salesOrderNumber || "").trim().toLowerCase()
      if (soNum) {
        const matchedSo = await prisma.salesOrder.findFirst({
          where: { OR: [
            { items: { path: ["salesOrderNumber"], equals: soNum } },
            { items: { path: ["salesorder_number"],  equals: soNum } }
          ]},
          select: { orderDate: true }
        })
        if (matchedSo?.orderDate) matchedIssueDate = matchedSo.orderDate
      }

      await prisma.invoice.update({
        where: { id: dbDoc.id },
        data: {
          status,
          items: updatedItems,
          issueDate:            matchedIssueDate || (doc.date ? new Date(doc.date) : undefined),
          actualShippingCost:   updatedItems.actualShippingCost,
          shippingCostBreakdown: updatedItems.shippingCostBreakdown,
          ...syncFields,
        }
      })

      await processInvoiceCosts({
        httpMethod: "POST",
        body: JSON.stringify({ invoiceId: booksId, skipLoopGuard: true }),
      } as any, {} as any).catch(e => console.error("Webhook error auto-processing invoice costs:", e))

    } else if (type === "SalesOrder") {
      await prisma.salesOrder.update({
        where: { id: dbDoc.id },
        data: {
          status,
          items: updatedItems,
          actualShippingCost:    updatedItems.actualShippingCost,
          shippingCostBreakdown: updatedItems.shippingCostBreakdown,
          ...syncFields,
        }
      })

      await processSalesOrderCosts({
        httpMethod: "POST",
        body: JSON.stringify({ salesorderId: booksId, skipLoopGuard: true }),
      } as any, {} as any).catch(e => console.error("Webhook error auto-processing SO costs:", e))

    } else {
      await prisma.quote.update({ where: { id: dbDoc.id }, data: { status, items: updatedItems, ...syncFields } })
      await processQuoteCosts({
        httpMethod: "POST",
        body: JSON.stringify({ estimateId: booksId, skipLoopGuard: true }),
      } as any, {} as any).catch(e => console.error("Webhook error auto-processing quote costs:", e))
    }

    console.log(`✅ Webhook: Updated ${type} ${booksId} (status: ${status}, ${(updatedItems.line_items || []).length} line items)`)

    // ── Invalidate stale PDF cache ──────────────────────────────────────────
    try {
      const store = getStore({ name: "invoice-pdfs", consistency: "strong" })
      const t = type === "SalesOrder" ? "so" : type === "Quote" ? "qte" : "inv"
      await store.delete(`pdf/${t}/${booksId}`)
    } catch (_) { /* non-fatal */ }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: `${type} ${booksId} synced` })
    }

  } catch (err: any) {
    console.error("zoho-books-webhook error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
