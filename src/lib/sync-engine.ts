/**
 * sync-engine.ts
 * ──────────────
 * Shared utilities for bidirectional Zoho ↔ App sync.
 *
 * Responsibilities:
 *  1. Conflict detection — compares Zoho's last_modified_time against
 *     the local record's lastSyncedAt and appModifiedAt timestamps.
 *     Resolution policy: B (flag everything, require manual review).
 *  2. Payment enrichment — fetches invoice payments from Zoho and
 *     upserts them into the local Payment table.
 *  3. DB helpers — writes enriched + calculated data back to Invoice /
 *     SalesOrder / Quote, always updating sync timestamps.
 */

import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

const prisma = new PrismaClient()
const ORG_ID = ZOHO_ORGANIZATION_ID

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocType = "invoice" | "salesorder" | "quote"

export interface ConflictResult {
  hasConflict: boolean
  /** fieldName → { app: current local value, zoho: incoming Zoho value } */
  fields: Record<string, { app: unknown; zoho: unknown }>
}

export interface ZohoPayment {
  payment_id: string
  invoice_id?: string
  invoice_number?: string
  amount: number
  date: string
  payment_mode?: string
  status?: string
  reference_number?: string
  bank_charges?: number
  description?: string
}

// ---------------------------------------------------------------------------
// 1. Conflict Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether both the app and Zoho modified this document since the
 * last successful sync.  Resolution policy B: if both sides changed,
 * flag the document and list every field that differs — do not auto-resolve.
 *
 * @param localRecord  The DB row (Invoice | SalesOrder | Quote)
 * @param zohoDoc      The full document object returned by Zoho Books
 * @param appOwnedKeys Fields that the app exclusively writes — these are
 *                     never flagged as conflicts because Zoho never sets them.
 */
export function detectConflict(
  localRecord: {
    lastSyncedAt: Date | null
    appModifiedAt: Date | null
    zohoModifiedTime: Date | null
    items: unknown
  },
  zohoDoc: Record<string, unknown>,
  appOwnedKeys: string[] = APP_OWNED_KEYS
): ConflictResult {
  const now = Date.now()

  // Parse Zoho's last_modified_time
  const zohoModRaw = (zohoDoc.last_modified_time as string) ?? null
  const zohoModAt  = zohoModRaw ? new Date(zohoModRaw).getTime() : 0

  const lastSynced   = localRecord.lastSyncedAt?.getTime()  ?? 0
  const appModified  = localRecord.appModifiedAt?.getTime() ?? 0

  // Zoho changed after last sync?
  const zohoChanged = zohoModAt > lastSynced && lastSynced > 0

  // App changed after last sync?
  const appChanged = appModified > lastSynced && lastSynced > 0

  // First sync ever — no conflict possible yet
  if (lastSynced === 0) {
    return { hasConflict: false, fields: {} }
  }

  if (!zohoChanged || !appChanged) {
    return { hasConflict: false, fields: {} }
  }

  // Both sides changed → collect every field that differs (excluding app-owned)
  const localItems = (localRecord.items as Record<string, unknown>) ?? {}
  const conflictFields: ConflictResult["fields"] = {}

  // Compare Zoho-owned scalar fields that we store locally
  for (const key of ZOHO_OWNED_SCALAR_KEYS) {
    if (appOwnedKeys.includes(key)) continue
    const zohoVal = zohoDoc[key]
    const appVal  = localItems[key]
    // Only flag if we have BOTH values and they differ
    if (appVal !== undefined && zohoVal !== undefined && String(appVal) !== String(zohoVal)) {
      conflictFields[key] = { app: appVal, zoho: zohoVal }
    }
  }

  const hasConflict = Object.keys(conflictFields).length > 0
  return { hasConflict, fields: conflictFields }
}

// Fields the app exclusively calculates and writes — Zoho never sets these
export const APP_OWNED_KEYS = [
  "deadCostTotal",
  "deadCostSubjectToVig",
  "deadCostNoVig",
  "deadCostPlusVig",
  "deadProfitActual",
  "vigRate",
  "profit",
  "marginPercent",
  "salesCommission",
  "commissionPercent",
  "tariffAmount",
  "lineItemDetails",
  "itemsDcBreakdown",
  "costsCalculatedAt",
]

// Zoho-owned fields we mirror locally (compared during conflict check)
const ZOHO_OWNED_SCALAR_KEYS = [
  "status",
  "customer_name",
  "salesperson_name",
  "sub_total",
  "total",
  "balance",
  "payment_made",
  "adjustment",
  "adjustment_description",
  "currency_code",
  "exchange_rate",
]

// ---------------------------------------------------------------------------
// 2. Payment Enrichment (Invoices only)
// ---------------------------------------------------------------------------

/**
 * Fetches all payments for a Zoho Books invoice and upserts them into
 * the local Payment table.  Also returns a payment summary object.
 */
export async function syncInvoicePayments(
  zohoInvoiceId: string,
  invoiceDbId: string
): Promise<{
  paymentMade: number
  paymentExpected: number | null
  lastPaymentDate: Date | null
  balance: number | null
  paymentCount: number
}> {
  let payments: ZohoPayment[] = []

  try {
    const token = await getZohoAccessToken()
    if (!token) throw new Error("No Zoho token")

    const res = await fetch(
      `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${zohoInvoiceId}/payments?organization_id=${ORG_ID}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )

    if (res.ok) {
      const data = await res.json()
      payments = data.payments ?? []
    } else {
      console.warn(`[sync-engine] Payment fetch returned ${res.status} for invoice ${zohoInvoiceId}`)
    }
  } catch (err: unknown) {
    console.warn("[sync-engine] Payment fetch failed:", (err as Error).message)
  }

  // Upsert each payment
  let totalPaid   = 0
  let lastPayDate: Date | null = null

  for (const pmt of payments) {
    const pmtDate = pmt.date ? new Date(pmt.date) : null
    if (pmtDate && (!lastPayDate || pmtDate > lastPayDate)) {
      lastPayDate = pmtDate
    }
    totalPaid += pmt.amount ?? 0

    try {
      await prisma.payment.upsert({
        where: { zohoId: pmt.payment_id },
        create: {
          zohoId:          pmt.payment_id,
          invoiceId:       zohoInvoiceId,
          invoiceDbId:     invoiceDbId,
          invoiceNumber:   pmt.invoice_number ?? null,
          amount:          pmt.amount ?? 0,
          date:            pmtDate,
          mode:            pmt.payment_mode ?? null,
          status:          pmt.status ?? null,
          referenceNumber: pmt.reference_number ?? null,
          bankCharges:     pmt.bank_charges ?? 0,
          description:     pmt.description ?? null,
        },
        update: {
          invoiceDbId:     invoiceDbId,
          amount:          pmt.amount ?? 0,
          date:            pmtDate,
          mode:            pmt.payment_mode ?? null,
          status:          pmt.status ?? null,
          referenceNumber: pmt.reference_number ?? null,
          bankCharges:     pmt.bank_charges ?? 0,
          description:     pmt.description ?? null,
        },
      })
    } catch (e: unknown) {
      console.warn("[sync-engine] Payment upsert failed:", (e as Error).message)
    }
  }

  return {
    paymentMade:     totalPaid,
    paymentExpected: null,   // filled by caller from zoho doc
    lastPaymentDate: lastPayDate,
    balance:         null,   // filled by caller from zoho doc
    paymentCount:    payments.length,
  }
}

// ---------------------------------------------------------------------------
// 3. DB write helpers
// ---------------------------------------------------------------------------

/**
 * After processing an invoice, persist:
 *  - Calculated app-owned fields (costs, VIG, profit, commission)
 *  - Zoho-owned snapshot fields (status, amounts, dates)
 *  - Payment summary
 *  - Sync timestamps + conflict state
 */
export async function updateInvoiceRecord(opts: {
  localId:          string
  zohoDoc:          Record<string, unknown>
  calcItems:        Record<string, unknown>   // output of calculateDocumentCosts
  conflictResult:   ConflictResult
  paymentSummary:   Awaited<ReturnType<typeof syncInvoicePayments>>
}): Promise<void> {
  const { localId, zohoDoc, calcItems, conflictResult, paymentSummary } = opts
  const now = new Date()

  // Parse Zoho timestamps
  const zohoModTime = zohoDoc.last_modified_time
    ? new Date(zohoDoc.last_modified_time as string)
    : null

  const lastPaymentDate = paymentSummary.lastPaymentDate

  // Build the updated items JSON merge
  const existing = await prisma.invoice.findUnique({
    where: { id: localId },
    select: { items: true },
  })
  const currentItems = (existing?.items as Record<string, unknown>) ?? {}

  const mergedItems = {
    ...currentItems,
    // Zoho-owned snapshot
    status:             zohoDoc.status,
    customer_name:      zohoDoc.customer_name,
    salesperson_name:   zohoDoc.salesperson_name,
    sub_total:          zohoDoc.sub_total,
    total:              zohoDoc.total,
    balance:            zohoDoc.balance,
    payment_made:       zohoDoc.payment_made,
    currency_code:      zohoDoc.currency_code,
    line_items:         zohoDoc.line_items,
    custom_fields:      zohoDoc.custom_fields,
    // App-owned calculated
    ...calcItems,
    // Payment
    paymentDate:        lastPaymentDate?.toISOString().split("T")[0] ?? currentItems.paymentDate,
  }

  await prisma.invoice.update({
    where: { id: localId },
    data: {
      status:               (zohoDoc.status as string) ?? undefined,
      amount:               parseFloat((zohoDoc.sub_total as string) ?? "0") || 0,
      zohoModifiedTime:     zohoModTime,
      lastZohoModifiedTime: zohoModTime,
      lastSyncedAt:         now,
      appModifiedAt:        now,
      syncConflict:         conflictResult.hasConflict,
      conflictFields:       conflictResult.hasConflict
                              ? JSON.parse(JSON.stringify(conflictResult.fields))
                              : undefined,
      pendingZohoFetch:     false,
      // Payment summary
      paymentMade:          parseFloat((zohoDoc.payment_made as string) ?? "0") || 0,
      paymentExpected:      zohoDoc.payment_expected != null
                              ? parseFloat(zohoDoc.payment_expected as string)
                              : null,
      lastPaymentDate:      lastPaymentDate,
      balance:              zohoDoc.balance != null
                              ? parseFloat(zohoDoc.balance as string)
                              : null,
      items: JSON.parse(JSON.stringify(mergedItems)),
    },
  })
}

/**
 * After processing a SalesOrder, persist calculated + Zoho snapshot + sync state.
 */
export async function updateSalesOrderRecord(opts: {
  localId:        string
  zohoDoc:        Record<string, unknown>
  calcItems:      Record<string, unknown>
  conflictResult: ConflictResult
}): Promise<void> {
  const { localId, zohoDoc, calcItems, conflictResult } = opts
  const now = new Date()

  const zohoModTime = zohoDoc.last_modified_time
    ? new Date(zohoDoc.last_modified_time as string)
    : null

  const existing = await prisma.salesOrder.findUnique({
    where: { id: localId },
    select: { items: true },
  })
  const currentItems = (existing?.items as Record<string, unknown>) ?? {}

  const mergedItems = {
    ...currentItems,
    status:           zohoDoc.status,
    customer_name:    zohoDoc.customer_name,
    salesperson_name: zohoDoc.salesperson_name,
    sub_total:        zohoDoc.sub_total,
    total:            zohoDoc.total,
    line_items:       zohoDoc.line_items,
    custom_fields:    zohoDoc.custom_fields,
    ...calcItems,
  }

  await prisma.salesOrder.update({
    where: { id: localId },
    data: {
      status:               (zohoDoc.status as string) ?? undefined,
      amount:               parseFloat((zohoDoc.sub_total as string) ?? "0") || 0,
      zohoModifiedTime:     zohoModTime,
      lastZohoModifiedTime: zohoModTime,
      lastSyncedAt:         now,
      appModifiedAt:        now,
      syncConflict:         conflictResult.hasConflict,
      conflictFields:       conflictResult.hasConflict
                              ? JSON.parse(JSON.stringify(conflictResult.fields))
                              : undefined,
      pendingZohoFetch:     false,
      items:                JSON.parse(JSON.stringify(mergedItems)),
    },
  })
}

/**
 * After processing a Quote/Estimate, persist calculated + Zoho snapshot + sync state.
 */
export async function updateQuoteRecord(opts: {
  localId:        string
  zohoDoc:        Record<string, unknown>
  calcItems:      Record<string, unknown>
  conflictResult: ConflictResult
}): Promise<void> {
  const { localId, zohoDoc, calcItems, conflictResult } = opts
  const now = new Date()

  const zohoModTime = zohoDoc.last_modified_time
    ? new Date(zohoDoc.last_modified_time as string)
    : null

  const existing = await prisma.quote.findUnique({
    where: { id: localId },
    select: { items: true },
  })
  const currentItems = (existing?.items as Record<string, unknown>) ?? {}

  const mergedItems = {
    ...currentItems,
    status:           zohoDoc.status,
    customer_name:    zohoDoc.customer_name,
    salesperson_name: zohoDoc.salesperson_name,
    sub_total:        zohoDoc.sub_total,
    total:            zohoDoc.total,
    line_items:       zohoDoc.line_items,
    custom_fields:    zohoDoc.custom_fields,
    ...calcItems,
  }

  await prisma.quote.update({
    where: { id: localId },
    data: {
      status:               (zohoDoc.status as string) ?? undefined,
      amount:               parseFloat((zohoDoc.sub_total as string) ?? "0") || 0,
      zohoModifiedTime:     zohoModTime,
      lastZohoModifiedTime: zohoModTime,
      lastSyncedAt:         now,
      appModifiedAt:        now,
      syncConflict:         conflictResult.hasConflict,
      conflictFields:       conflictResult.hasConflict
                              ? JSON.parse(JSON.stringify(conflictResult.fields))
                              : undefined,
      pendingZohoFetch:     false,
      items:                JSON.parse(JSON.stringify(mergedItems)),
    },
  })
}
