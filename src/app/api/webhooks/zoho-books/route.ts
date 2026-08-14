/**
 * POST /api/webhooks/zoho-books
 * ─────────────────────────────
 * Receives real-time event notifications from Zoho Books.
 *
 * Configure in Zoho Books → Settings → Webhooks:
 *   URL:     https://tdusales.com/api/webhooks/zoho-books
 *   Method:  POST
 *   Events:  invoice_created, invoice_updated, invoice_deleted,
 *            salesorder_updated, estimate_updated,
 *            customerpayment_created, customerpayment_updated
 *
 * What this does:
 *   - invoice_updated / salesorder_updated / estimate_updated →
 *       Sets pendingZohoFetch = true on the matching local record.
 *       Does NOT overwrite any data — flags it for the next sync run.
 *   - customerpayment_created / customerpayment_updated →
 *       Immediately upserts the payment into the local Payment table
 *       and refreshes the invoice's payment summary fields.
 *   - invoice_created → imports the invoice if it doesn't exist yet.
 *   - invoice_deleted → marks the local invoice status as 'Deleted'.
 *
 * Zoho Books sends a shared secret token in the header X-Zoho-Webhook-Token.
 * Set ZOHO_WEBHOOK_TOKEN in env vars to verify.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from "next/server"

import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

const WEBHOOK_TOKEN = process.env.ZOHO_WEBHOOK_TOKEN ?? ""

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifyToken(req: NextRequest): boolean {
  if (!WEBHOOK_TOKEN) return false // fail closed if token is not configured
  const incoming = req.headers.get("x-zoho-webhook-token") ?? ""
  return incoming === WEBHOOK_TOKEN
}

async function markPendingFetch(
  table: "invoice" | "salesOrder" | "quote",
  zohoId: string,
  zohoModifiedTime?: string
) {
  const modTime = zohoModifiedTime ? new Date(zohoModifiedTime) : new Date()
  try {
    if (table === "invoice") {
      await prisma.invoice.updateMany({
        where: { zohoId },
        data: { pendingZohoFetch: true, lastZohoModifiedTime: modTime },
      })
    } else if (table === "salesOrder") {
      await prisma.salesOrder.updateMany({
        where: { zohoId },
        data: { pendingZohoFetch: true, lastZohoModifiedTime: modTime },
      })
    } else {
      await prisma.quote.updateMany({
        where: { zohoId },
        data: { pendingZohoFetch: true, lastZohoModifiedTime: modTime },
      })
    }
  } catch (e: unknown) {
    console.error(`[zoho-books-webhook] markPendingFetch failed for ${table} ${zohoId}:`, (e as Error).message)
  }
}

async function syncPaymentFromWebhook(payment: Record<string, unknown>) {
  const pmtId     = payment.payment_id as string
  const invoiceId = payment.invoice_id as string | undefined
  if (!pmtId) return

  const pmtDate = payment.date ? new Date(payment.date as string) : null

  // Find the local Invoice row
  let invoiceDbId: string | null = null
  if (invoiceId) {
    const inv = await prisma.invoice.findFirst({
      where: { zohoId: invoiceId },
      select: { id: true },
    })
    if (inv) invoiceDbId = inv.id
  }

  try {
    await prisma.payment.upsert({
      where: { zohoId: pmtId },
      create: {
        zohoId:          pmtId,
        invoiceId:       invoiceId ?? null,
        invoiceDbId:     invoiceDbId,
        invoiceNumber:   (payment.invoice_number as string) ?? null,
        amount:          parseFloat((payment.amount as string) ?? "0") || 0,
        date:            pmtDate,
        mode:            (payment.payment_mode as string) ?? null,
        status:          (payment.status as string) ?? null,
        referenceNumber: (payment.reference_number as string) ?? null,
        bankCharges:     parseFloat((payment.bank_charges as string) ?? "0") || 0,
        description:     (payment.description as string) ?? null,
      },
      update: {
        invoiceDbId,
        amount:          parseFloat((payment.amount as string) ?? "0") || 0,
        date:            pmtDate,
        mode:            (payment.payment_mode as string) ?? null,
        status:          (payment.status as string) ?? null,
        referenceNumber: (payment.reference_number as string) ?? null,
        bankCharges:     parseFloat((payment.bank_charges as string) ?? "0") || 0,
        description:     (payment.description as string) ?? null,
      },
    })
  } catch (e: unknown) {
    console.error("[zoho-books-webhook] payment upsert failed:", (e as Error).message)
  }

  // Also refresh the invoice payment summary via fresh Zoho fetch
  if (invoiceId && invoiceDbId) {
    try {
      const token = await getZohoAccessToken()
      if (!token) return
      const res = await fetch(
        `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${invoiceId}?organization_id=${ZOHO_ORGANIZATION_ID}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        const inv  = data.invoice ?? {}
        await prisma.invoice.update({
          where: { id: invoiceDbId },
          data: {
            status:           (inv.status as string) ?? undefined,
            paymentMade:      parseFloat(inv.payment_made ?? "0") || 0,
            paymentExpected:  parseFloat(inv.payment_expected ?? "0") || null,
            lastPaymentDate:  inv.last_payment_date ? new Date(inv.last_payment_date) : null,
            balance:          parseFloat(inv.balance ?? "0") ?? null,
            pendingZohoFetch: true,
            lastZohoModifiedTime: inv.last_modified_time ? new Date(inv.last_modified_time) : new Date(),
          },
        })
      }
    } catch (e: unknown) {
      console.warn("[zoho-books-webhook] Invoice summary refresh failed:", (e as Error).message)
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Read the ?type=Invoice query param (set in Zoho webhook URL params)
  const { searchParams } = new URL(req.url)
  const urlType = (searchParams.get("type") ?? "").toLowerCase() // "invoice", "salesorder", "estimate"

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    // Zoho sometimes sends form-encoded or empty body on certain events
    body = {}
  }

  // Zoho Books webhook body format:
  // { "JSONString": "{\"invoice_id\":\"...\", ...}" }  or flat object
  let data: Record<string, unknown> = body
  if (typeof body.JSONString === "string") {
    try { data = JSON.parse(body.JSONString) } catch { data = body }
  } else if (body.data && typeof body.data === "object") {
    data = body.data as Record<string, unknown>
  }

  // Determine event type — Zoho sends event_type in body, or we infer from ?type param
  const event = (body.event_type as string)
    ?? (body.eventtype as string)
    ?? (body.event as string)
    ?? ""

  console.log(`[zoho-books-webhook] type=${urlType} event=${event}`, JSON.stringify(data).slice(0, 300))

  try {
    // ── Route by ?type query param first (reliable), fallback to event string ──

    const isInvoice    = urlType === "invoice"    || event.startsWith("invoice")
    const isSalesOrder = urlType === "salesorder" || event.startsWith("salesorder")
    const isEstimate   = urlType === "estimate"   || event.startsWith("estimate")
    const isPayment    = urlType === "payment"    || event.startsWith("customerpayment")

    // ── Invoice events ────────────────────────────────────────────────────────
    if (isInvoice && event !== "invoice_deleted") {
      const zohoId  = (data.invoice_id as string) ?? (data.id as string)
      const modTime = data.last_modified_time as string | undefined
      if (zohoId) await markPendingFetch("invoice", zohoId, modTime)
    }

    else if (event === "invoice_deleted") {
      const zohoId = (data.invoice_id as string) ?? (data.id as string)
      if (zohoId) {
        await prisma.invoice.updateMany({
          where: { zohoId },
          data: { status: "deleted", pendingZohoFetch: false },
        })
      }
    }

    // ── Sales Order events ────────────────────────────────────────────────────
    else if (isSalesOrder) {
      const zohoId  = (data.salesorder_id as string) ?? (data.id as string)
      const modTime = data.last_modified_time as string | undefined
      if (zohoId) await markPendingFetch("salesOrder", zohoId, modTime)
    }

    // ── Estimate events ───────────────────────────────────────────────────────
    else if (isEstimate) {
      const zohoId  = (data.estimate_id as string) ?? (data.id as string)
      const modTime = data.last_modified_time as string | undefined
      if (zohoId) await markPendingFetch("quote", zohoId, modTime)
    }

    // ── Payment events ────────────────────────────────────────────────────────
    else if (isPayment) {
      await syncPaymentFromWebhook(data)
    }

    // ── Unknown — log for debugging ───────────────────────────────────────────
    else {
      console.log(`[zoho-books-webhook] Unhandled: type=${urlType} event=${event}`, JSON.stringify(data).slice(0, 500))
    }

    return NextResponse.json({ received: true, type: urlType, event })
  } catch (err: unknown) {
    console.error("[zoho-books-webhook] Processing error:", (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Zoho sends GET to verify the webhook endpoint during setup
export async function GET() {
  return NextResponse.json({ status: "Zoho Books webhook active", url: "https://tdusales.com/api/webhooks/zoho-books" })
}
