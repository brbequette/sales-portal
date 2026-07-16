/**
 * documentService.ts
 *
 * Client-side service for all document operations (Invoice, Quote, SalesOrder).
 * Single source of truth for document fetch and cost-processing calls.
 * Eliminates duplicate fetch('/api/...') patterns scattered across:
 *   - InvoiceDetailsModal.tsx
 *   - page.tsx (fullInvoiceDetails state)
 *   - AccountSlideout.tsx
 */

export type DocumentType = "invoice" | "estimate" | "salesorder"

// ─── Fetch document details ────────────────────────────────────────────────────

export async function fetchDocument(id: string, type: DocumentType = "invoice"): Promise<any> {
  const res = await fetch("/api/get-invoice-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${type} ${id}: ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || `Failed to fetch ${type}`)
  return data
}

// ─── Process / recalculate costs ──────────────────────────────────────────────

export interface ProcessCostsOptions {
  vigRate?: number | null
  commissionPercent?: number | null
  noVigOverrides?: Record<string, boolean>
  skipLoopGuard?: boolean
}

export async function processInvoiceCosts(
  invoiceIdOrNumber: string,
  isId = true,
  opts: ProcessCostsOptions = {}
): Promise<any> {
  const res = await fetch("/.netlify/functions/process-invoice-costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(isId ? { invoiceId: invoiceIdOrNumber } : { invoiceNumber: invoiceIdOrNumber }),
      ...opts,
    }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || "Invoice cost processing failed")
  return data
}

export async function processQuoteCosts(
  estimateIdOrNumber: string,
  isId = true,
  opts: ProcessCostsOptions = {}
): Promise<any> {
  const res = await fetch("/.netlify/functions/process-quote-costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(isId ? { estimateId: estimateIdOrNumber } : { estimateNumber: estimateIdOrNumber }),
      ...opts,
    }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || "Quote cost processing failed")
  return data
}

export async function processSalesOrderCosts(
  salesorderIdOrNumber: string,
  isId = true,
  opts: ProcessCostsOptions = {}
): Promise<any> {
  const res = await fetch("/.netlify/functions/process-salesorder-costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(isId ? { salesorderId: salesorderIdOrNumber } : { salesorderNumber: salesorderIdOrNumber }),
      ...opts,
    }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || "Sales order cost processing failed")
  return data
}

// ─── Unified dispatcher ────────────────────────────────────────────────────────

export function processDocumentCosts(
  idOrNumber: string,
  type: DocumentType,
  isId = true,
  opts: ProcessCostsOptions = {}
): Promise<any> {
  if (type === "invoice") return processInvoiceCosts(idOrNumber, isId, opts)
  if (type === "estimate") return processQuoteCosts(idOrNumber, isId, opts)
  if (type === "salesorder") return processSalesOrderCosts(idOrNumber, isId, opts)
  throw new Error(`Unknown document type: ${type}`)
}
