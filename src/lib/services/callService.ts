/**
 * callService.ts
 *
 * Client-side service for logging calls.
 * Unifies log-sales-call and log-collection-call behind one function.
 * Eliminates the 5 separate inline fetch('/api/log-collection-call') calls in
 * collections/page.tsx and the one in SalesCallCampaignModal.tsx.
 */

export type CallType = "sales" | "collection"

// ─── Shared call log payload ───────────────────────────────────────────────────

export interface SalesCallPayload {
  accountId: string
  contactId?: string
  outcome: string
  notes?: string
  duration?: number
  nextFollowUp?: string
  // Fact-finding fields
  ffBladeCount?: number
  ffBladesPerOrder?: number
  ffBudget?: string
  ffCurrentSupplier?: string
  ffDecisionMaker?: string
  ffPainPoint?: string
  ffTimeline?: string
  ffSwitchBarriers?: string
  ffWarmth?: number
  ffInterest?: string
  ffNotes?: string
  // Order builder
  orderItems?: any[]
  orderTotal?: number
  // Campaign context
  campaignId?: string
}

export interface CollectionCallPayload {
  accountId: string
  contactId?: string
  invoiceId?: string
  invoiceNumber?: string
  outcome: string
  notes?: string
  promiseDate?: string
  promiseAmount?: number
  disputeReason?: string
  duration?: number
}

// ─── Log a call ───────────────────────────────────────────────────────────────

export async function logCall(
  type: "sales",
  payload: SalesCallPayload
): Promise<any>
export async function logCall(
  type: "collection",
  payload: CollectionCallPayload
): Promise<any>
export async function logCall(
  type: CallType,
  payload: SalesCallPayload | CollectionCallPayload
): Promise<any> {
  const endpoint = type === "sales" ? "/api/log-sales-call" : "/api/log-collection-call"
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to log ${type} call: ${res.status} — ${text}`)
  }
  const data = await res.json()
  if (!data.success) throw new Error(data.error || `${type} call log failed`)
  return data
}

// ─── Convenience wrappers ──────────────────────────────────────────────────────

export const logSalesCall = (payload: SalesCallPayload) => logCall("sales", payload)
export const logCollectionCall = (payload: CollectionCallPayload) => logCall("collection", payload)
