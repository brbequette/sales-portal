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

import { prisma } from "../../netlify/functions/lib/prisma"
import { Prisma } from "@prisma/client"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

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

export interface PaymentUpsertPlan {
  sourcePaymentId: string
  create: Omit<Prisma.PaymentCreateInput, 'invoice' | 'invoiceDbId'>
  update: Omit<Prisma.PaymentUpdateInput, 'invoice' | 'invoiceDbId'>
}

export interface PaymentPersistencePlan {
  payments: PaymentUpsertPlan[]
  summary: { paymentMade: number; paymentExpected: number | null; lastPaymentDate: Date | null; balance: number | null; paymentCount: number }
}

export interface FinancialReviewUpsertPlan {
  documentType: string
  documentRef: string
  reasonCode: string
  invoiceId?: string
  sourceType?: string
  sourceRecord?: string
  metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
}

export interface FinancialReviewResolutionPlan {
  documentType: string
  documentRef: string
  reasonCode: string
  resolverId?: string
  resolutionNotes?: string
}

export type InvoicePersistencePlan = {
  mode: 'create-or-update' | 'update-existing'
  identity: { id?: string; zohoId: string }
  createData: Prisma.InvoiceCreateInput
  updateData: Prisma.InvoiceUpdateInput
  lineItems: unknown
  payments: PaymentPersistencePlan
  reviewUpserts: FinancialReviewUpsertPlan[]
  reviewResolutions: FinancialReviewResolutionPlan[]
}

type InvoicePersistenceTestHooks = Partial<Record<'afterInvoice' | 'afterPayments' | 'afterLineItems' | 'afterReviews', () => void>>
async function applyInvoicePersistencePlanInTransaction(tx: Prisma.TransactionClient, plan: InvoicePersistencePlan, hooks?: InvoicePersistenceTestHooks) {
  const invoice = plan.mode === 'update-existing'
    ? await tx.invoice.update({ where: plan.identity.id ? { id: plan.identity.id } : { zohoId: plan.identity.zohoId }, data: plan.updateData })
    : await tx.invoice.upsert({ where: { zohoId: plan.identity.zohoId }, create: plan.createData, update: plan.updateData })
  hooks?.afterInvoice?.()
  await persistStoredLineItems(tx, 'invoice', invoice.id, plan.lineItems)
  hooks?.afterLineItems?.()
  await applyPaymentPersistencePlan(tx, plan.payments, invoice.id)
  hooks?.afterPayments?.()
  for (const review of plan.reviewUpserts) {
    await tx.financialReview.upsert({ where: { documentType_documentRef_reasonCode: { documentType: review.documentType, documentRef: review.documentRef, reasonCode: review.reasonCode } }, create: { documentType: review.documentType, documentRef: review.documentRef, invoiceId: review.invoiceId, reasonCode: review.reasonCode, sourceType: review.sourceType, sourceRecord: review.sourceRecord, ...(review.metadata === undefined ? {} : { metadata: review.metadata }), status: 'OPEN' }, update: { sourceType: review.sourceType, sourceRecord: review.sourceRecord, ...(review.metadata === undefined ? {} : { metadata: review.metadata }) } })
  }
  for (const resolution of plan.reviewResolutions) {
    await tx.financialReview.updateMany({ where: { documentType: resolution.documentType, documentRef: resolution.documentRef, reasonCode: resolution.reasonCode, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolverId: resolution.resolverId, resolutionNotes: resolution.resolutionNotes } })
  }
  hooks?.afterReviews?.()
  return invoice
}

export async function applyInvoicePersistencePlan(plan: InvoicePersistencePlan, db: typeof prisma = prisma) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction((tx) => applyInvoicePersistencePlanInTransaction(tx, plan))
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2002' && String(error.meta?.target ?? '').includes('zohoId')))
      if (!retryable || attempt === maxAttempts) throw error
    }
  }
  throw new Error('Atomic invoice persistence retry exhausted')
}

export async function __testOnlyApplyInvoicePersistencePlan(plan: InvoicePersistencePlan, hooks: InvoicePersistenceTestHooks) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only transaction seam')
  return prisma.$transaction((tx) => applyInvoicePersistencePlanInTransaction(tx, plan, hooks))
}

/** Remote-only payment retrieval; persistence is deliberately separate. */
export async function fetchInvoicePaymentsFromZoho(zohoInvoiceId: string): Promise<ZohoPayment[]> {
  const token = await getZohoAccessToken()
  if (!token) throw new Error("No Zoho token")
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${zohoInvoiceId}/payments?organization_id=${ORG_ID}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  if (!response.ok) throw new Error(`[sync-engine] Payment fetch returned ${response.status} for invoice ${zohoInvoiceId}`)
  const payload = await response.json() as { payments?: ZohoPayment[] }
  return payload.payments ?? []
}

/** Pure, replay-safe normalization of payment rows and summary values. */
export function buildPaymentPersistencePlan(payments: ZohoPayment[], _invoiceDbId: string): PaymentPersistencePlan {
  let paymentMade = 0
  let lastPaymentDate: Date | null = null
  const plans = payments.map((payment) => {
    const date = payment.date ? new Date(payment.date) : null
    if (date && (!lastPaymentDate || date > lastPaymentDate)) lastPaymentDate = date
    paymentMade += payment.amount ?? 0
    return { sourcePaymentId: payment.payment_id, create: { zohoId: payment.payment_id, invoiceId: payment.invoice_id ?? null, invoiceNumber: payment.invoice_number ?? null, amount: payment.amount ?? 0, date, mode: payment.payment_mode ?? null, status: payment.status ?? null, referenceNumber: payment.reference_number ?? null, bankCharges: payment.bank_charges ?? 0, description: payment.description ?? null }, update: { amount: payment.amount ?? 0, date, mode: payment.payment_mode ?? null, status: payment.status ?? null, referenceNumber: payment.reference_number ?? null, bankCharges: payment.bank_charges ?? 0, description: payment.description ?? null } }
  })
  return { payments: plans, summary: { paymentMade, paymentExpected: null, lastPaymentDate, balance: null, paymentCount: payments.length } }
}

export async function applyPaymentPersistencePlan(tx: Prisma.TransactionClient, plan: PaymentPersistencePlan, localInvoiceId: string): Promise<void> {
  for (const payment of plan.payments) {
    await tx.payment.upsert({ where: { zohoId: payment.sourcePaymentId }, create: { ...payment.create, invoice: { connect: { id: localInvoiceId } } }, update: { ...payment.update, invoice: { connect: { id: localInvoiceId } } } })
  }
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
    lastZohoModifiedTime?: Date | null
    zohoModifiedTime?: Date | null
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

export async function assertNoBooksConflictBeforeWrite(
  docType: DocType,
  localRecord: {
    id: string
    zohoId: string | null
    lastSyncedAt: Date | null
    appModifiedAt: Date | null
    lastZohoModifiedTime: Date | null
    items: unknown
  },
): Promise<void> {
  if (!localRecord.zohoId) return

  const token = await getZohoAccessToken()
  const endpoint = docType === "invoice" ? "invoices" : docType === "salesorder" ? "salesorders" : "estimates"
  const response = await fetch(
    `https://www.zohoapis.${ZOHO_DC}/books/v3/${endpoint}/${localRecord.zohoId}?organization_id=${ORG_ID}`,
    { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } },
  )
  if (!response.ok) throw new Error(`Unable to verify current Books record (${response.status})`)

  const payload = await response.json()
  const remote = payload.invoice || payload.salesorder || payload.estimate
  if (!remote) throw new Error("Books returned no document during conflict check")

  const remoteModifiedAt = remote.last_modified_time ? new Date(remote.last_modified_time) : null
  const remoteChanged = !localRecord.lastSyncedAt
    || (!!remoteModifiedAt && remoteModifiedAt.getTime() > localRecord.lastSyncedAt.getTime())
  if (!remoteChanged) return

  const conflict = detectConflict({ ...localRecord, appModifiedAt: new Date() }, remote)
  if (!conflict.hasConflict) {
    conflict.hasConflict = true
    conflict.fields._record = {
      app: localRecord.lastSyncedAt?.toISOString() || "never synced",
      zoho: remoteModifiedAt?.toISOString() || "modified in Books",
    }
  }

  const data = {
    syncConflict: true,
    pendingZohoFetch: false,
    lastZohoModifiedTime: remoteModifiedAt || new Date(),
    conflictFields: JSON.parse(JSON.stringify(conflict.fields)),
  }
  if (docType === "invoice") await prisma.invoice.update({ where: { id: localRecord.id }, data })
  else if (docType === "salesorder") await prisma.salesOrder.update({ where: { id: localRecord.id }, data })
  else await prisma.quote.update({ where: { id: localRecord.id }, data })

  throw new Error("SYNC_CONFLICT: Books and the portal both changed this record. Administrator approval is required.")
}

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
  invoiceDbId: string,
  db: typeof prisma = prisma
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
      throw new Error(`[sync-engine] Payment fetch returned ${res.status} for invoice ${zohoInvoiceId}`)
    }
  } catch (err: unknown) {
    throw new Error(`[sync-engine] Payment fetch failed: ${(err as Error).message}`)
  }

  // Upsert each payment
  let totalPaid   = 0
  let lastPayDate: Date | null = null

  const ops = []
  for (const pmt of payments) {
    const pmtDate = pmt.date ? new Date(pmt.date) : null
    if (pmtDate && (!lastPayDate || pmtDate > lastPayDate)) {
      lastPayDate = pmtDate
    }
    totalPaid += pmt.amount ?? 0

    ops.push(
      prisma.payment.upsert({
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
    )
  }

  if (ops.length > 0) {
      await db.$transaction(ops)
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

  const finiteNumber = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  const commission = finiteNumber(calcItems.commission)
  const status = String(zohoDoc.status || "").toLowerCase()
  const isPaid = status === "paid" || finiteNumber(zohoDoc.balance) === 0

  await prisma.invoice.update({
    where: { id: localId },
    data: {
      status:               (zohoDoc.status as string) ?? undefined,
      amount:               parseFloat((zohoDoc.sub_total as string) ?? "0") || 0,
      issueDate:            zohoDoc.date ? new Date(`${String(zohoDoc.date)}T12:00:00.000Z`) : undefined,
      dueDate:              zohoDoc.due_date ? new Date(`${String(zohoDoc.due_date)}T12:00:00.000Z`) : null,
      zohoModifiedTime:     zohoModTime,
      lastZohoModifiedTime: zohoModTime,
      lastSyncedAt:         now,
      appModifiedAt:        now,
      syncConflict:         conflictResult.hasConflict,
      conflictFields:       conflictResult.hasConflict
                              ? JSON.parse(JSON.stringify(conflictResult.fields))
                              : undefined,
      pendingZohoFetch:     false,
      actualShippingCost:   finiteNumber(calcItems.actualShippingCost),
      shippingCostBreakdown:String(calcItems.shippingCostBreakdown || "").trim() || null,
      computedProfit:       finiteNumber(calcItems.profit),
      computedDeadProfit:   finiteNumber(calcItems.deadProfitActual),
      computedDeadCost:     finiteNumber(calcItems.deadCostTotal),
      computedVigRate:      finiteNumber(calcItems.vigRate),
      computedSalesperson:  String(zohoDoc.salesperson_name || "").trim() || null,
      computedInvoiceNumber:String(zohoDoc.invoice_number || "").trim() || null,
      computedUpfront:      commission == null ? null : commission / 2,
      computedFinal:        commission == null ? null : (isPaid ? commission / 2 : 0),
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
  await syncStoredLineItems("invoice", localId, zohoDoc.line_items)
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

  const finiteNumber = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
    return Number.isFinite(parsed) ? parsed : null
  }

  const mergedItems = {
    ...currentItems,
    status:           zohoDoc.status,
    customer_name:    zohoDoc.customer_name,
    salesperson_name: zohoDoc.salesperson_name,
    sub_total:        zohoDoc.sub_total,
    total:            zohoDoc.total,
    line_items:       zohoDoc.line_items,
    custom_fields:    zohoDoc.custom_fields,
    shipping_address: zohoDoc.shipping_address || (currentItems as any).shipping_address || null,
    billing_address:  zohoDoc.billing_address || (currentItems as any).billing_address || null,
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
      actualShippingCost:   finiteNumber(calcItems.actualShippingCost),
      shippingCostBreakdown:String(calcItems.shippingCostBreakdown || '').trim() || null,
      items:                JSON.parse(JSON.stringify(mergedItems)),
    },
  })
  await syncStoredLineItems("salesOrder", localId, zohoDoc.line_items)
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
  await syncStoredLineItems("quote", localId, zohoDoc.line_items)
}

export async function persistStoredLineItems(
  db: Prisma.TransactionClient,
  docType: "invoice" | "salesOrder" | "quote",
  documentId: string,
  rawLineItems: unknown,
): Promise<void> {
  const lineItems = Array.isArray(rawLineItems) ? rawLineItems as Record<string, unknown>[] : []
  const finiteNumber = (value: unknown, fallback = 0): number => {
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const relation = docType === "invoice"
    ? { invoiceId: documentId }
    : docType === "salesOrder"
      ? { salesOrderId: documentId }
      : { quoteId: documentId }

  await db.lineItem.deleteMany({ where: relation })
    if (lineItems.length === 0) return

    await db.lineItem.createMany({
      data: lineItems.map((item, index) => {
        const quantity = finiteNumber(item.quantity)
        const unitPrice = finiteNumber(item.rate ?? item.unit_price)
        const total = finiteNumber(item.item_total ?? item.total)
        // Books sometimes returns a percentage string (for example "100%")
        // instead of a numeric discount amount. Derive its monetary value from
        // the line total so Prisma never receives NaN.
        const discount = finiteNumber(
          item.discount_amount,
          Math.max(0, (quantity * unitPrice) - total),
        )

        return {
          ...relation,
          // Books may carry an item ID forward when one document is converted
          // into another, so scope it to the owning document locally.
          zohoLineItemId: `${docType}:${documentId}:${String(item.line_item_id || item.item_id || index)}`,
          productName: String(item.name || item.item_name || item.description || "Line item"),
          sku: item.sku ? String(item.sku) : null,
          quantity,
          unitPrice,
          discount,
          total,
          description: item.description ? String(item.description) : null,
        }
      }),
    })
}

export async function syncStoredLineItems(
  docType: "invoice" | "salesOrder" | "quote",
  documentId: string,
  rawLineItems: unknown,
): Promise<void> {
  await prisma.$transaction((tx) => persistStoredLineItems(tx, docType, documentId, rawLineItems))
}
