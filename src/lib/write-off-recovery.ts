import { createHash } from "node:crypto"

export const RECOVERY_COST_CATEGORIES = [
  "HISTORICAL_PRODUCT_COST", "GIFT_COST", "OUTBOUND_FREIGHT", "RETURN_FREIGHT",
  "ACTUAL_CARD_FEE", "ACTUAL_TARIFF", "COLLECTION_LEGAL_FEE", "APPROVED_ADDITIONAL_COST", "INSURANCE",
] as const
export const RECOVERY_CREDIT_CATEGORIES = [
  "VENDOR_REFUND", "CARRIER_REFUND", "PROCESSOR_REFUND", "ACCEPTED_RETURNED_PRODUCT_COST",
] as const
export const EXCLUDED_RECOVERY_CATEGORIES = ["SALES_TAX", "REVENUE", "MARKUP", "ESTIMATE"] as const

export type RecoveryDirection = "COST" | "RECOVERY"
export type RecoveryComponent = {
  category: string
  direction: RecoveryDirection
  amountCents: number
  approved: boolean
  sourceType: string
  sourceId?: string | null
  idempotencyKey: string
  reason: string
  evidence?: unknown
}
export type ReturnInspection = {
  status: "RECEIVED" | "ACCEPTED_RESELLABLE" | "DAMAGED" | "MISSING" | "UNSELLABLE"
  historicalProductCostCents: number
  acceptedProductCostCents: number
  receivedAt: Date
  inspectedAt?: Date | null
  inspectedById?: string | null
  idempotencyKey: string
  sourceType: string
  sourceId?: string | null
}
export type RecoveryDryRun = {
  originalCostCents: number
  recoveryCents: number
  netCompanyCostCents: number
  responsibilityChargeCents: number
  acceptedReturnCreditCents: number
  excludedCents: number
  responsibilityRateBps: number
  commissionReversalCents: number
  dryRunHash: string
}

const costCategories = new Set<string>(RECOVERY_COST_CATEGORIES)
const recoveryCategories = new Set<string>(RECOVERY_CREDIT_CATEGORIES)
const excludedCategories = new Set<string>(EXCLUDED_RECOVERY_CATEGORIES)

function assertCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer-cent value`)
}

export function isRecoveryManagerRole(role: unknown) {
  const normalized = String(role || "").trim().toLowerCase()
  return normalized === "master_admin" || normalized === "admin" || normalized === "administrator"
    || normalized.includes("manager")
}

export function isRecoveryManagementViewer(role: unknown) {
  return isRecoveryManagerRole(role) || String(role || "").trim().toLowerCase().includes("collections")
}

export function assertApprovalAuthority(input: {
  role: unknown; actorId: string; creatorId: string; submittedById?: string | null; responsibleRepId: string
}) {
  if (!isRecoveryManagerRole(input.role)) throw new Error("Manager approval required")
  if ([input.creatorId, input.submittedById, input.responsibleRepId].filter(Boolean).includes(input.actorId)) {
    throw new Error("Segregation of duties requires an independent manager approver")
  }
}

export function calculateWriteOffRecovery(input: {
  responsibilityRateBps: number
  previouslyPaidCommissionCents?: number
  components: RecoveryComponent[]
  inspections?: ReturnInspection[]
}): RecoveryDryRun {
  if (!Number.isInteger(input.responsibilityRateBps) || input.responsibilityRateBps < 0 || input.responsibilityRateBps > 10_000) {
    throw new Error("Responsibility rate must be between 0 and 10000 basis points")
  }
  const commissionReversalCents = input.previouslyPaidCommissionCents || 0
  assertCents(commissionReversalCents, "Previously paid commission")
  const keys = new Set<string>()
  let originalCostCents = 0
  let recoveryCents = 0
  let excludedCents = 0
  for (const component of input.components) {
    assertCents(component.amountCents, "Component amount")
    if (!component.idempotencyKey || keys.has(component.idempotencyKey)) throw new Error("Every component requires a unique idempotency key")
    keys.add(component.idempotencyKey)
    if (!component.reason.trim() || !component.sourceType.trim() || (!component.sourceId && component.evidence == null)) throw new Error("Every component requires documentary source and reason")
    if (excludedCategories.has(component.category)) { excludedCents += component.amountCents; continue }
    if ((component.category === "INSURANCE" || component.category === "APPROVED_ADDITIONAL_COST") && !component.approved) { excludedCents += component.amountCents; continue }
    if (component.direction === "COST" && costCategories.has(component.category)) originalCostCents += component.amountCents
    else if (component.direction === "RECOVERY" && recoveryCategories.has(component.category)) recoveryCents += component.amountCents
    else throw new Error(`Unsupported category/direction: ${component.category}/${component.direction}`)
  }

  let acceptedReturnCreditCents = 0
  for (const inspection of input.inspections || []) {
    assertCents(inspection.historicalProductCostCents, "Historical return cost")
    assertCents(inspection.acceptedProductCostCents, "Accepted return cost")
    if (!inspection.idempotencyKey || keys.has(inspection.idempotencyKey)) throw new Error("Every event requires a unique idempotency key")
    keys.add(inspection.idempotencyKey)
    const accepted = inspection.status === "ACCEPTED_RESELLABLE" && inspection.inspectedAt && inspection.inspectedById
    if (!accepted && inspection.acceptedProductCostCents !== 0) throw new Error("Only inspected, accepted resellable product may receive credit")
    if (inspection.acceptedProductCostCents > inspection.historicalProductCostCents) throw new Error("Accepted cost cannot exceed historical cost")
    if (accepted) acceptedReturnCreditCents += inspection.acceptedProductCostCents
  }
  recoveryCents += acceptedReturnCreditCents
  const netCompanyCostCents = Math.max(0, originalCostCents - recoveryCents)
  const responsibilityChargeCents = calculateResponsibilityShare(netCompanyCostCents, input.responsibilityRateBps)
  const canonical = JSON.stringify({
    responsibilityRateBps: input.responsibilityRateBps,
    commissionReversalCents,
    components: input.components.map(c => ({ ...c, sourceId: c.sourceId || null })).sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey)),
    inspections: (input.inspections || []).map(i => ({ ...i, receivedAt: i.receivedAt.toISOString(), inspectedAt: i.inspectedAt?.toISOString() || null })).sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey)),
  })
  return {
    originalCostCents, recoveryCents, netCompanyCostCents, responsibilityChargeCents,
    acceptedReturnCreditCents, excludedCents, responsibilityRateBps: input.responsibilityRateBps, commissionReversalCents,
    dryRunHash: createHash("sha256").update(canonical).digest("hex"),
  }
}

export function calculateResponsibilityShare(companyAmountCents: number, responsibilityRateBps: number) {
  assertCents(companyAmountCents, "Company amount")
  if (!Number.isInteger(responsibilityRateBps) || responsibilityRateBps < 0 || responsibilityRateBps > 10_000) throw new Error("Invalid responsibility rate")
  return Math.floor((companyAmountCents * responsibilityRateBps + 5_000) / 10_000)
}

export function applyLedgerEvent(balanceCents: number, direction: "DEBIT" | "CREDIT", amountCents: number) {
  assertCents(balanceCents, "Balance")
  assertCents(amountCents, "Ledger amount")
  return direction === "DEBIT" ? balanceCents + amountCents : Math.max(0, balanceCents - amountCents)
}

export function redactRecoveryCase<T extends Record<string, unknown>>(record: T, management: boolean): T {
  if (management) return record
  return Object.fromEntries(Object.entries(record).filter(([key]) => !["evidence", "sourceId", "actorId"].includes(key))) as T
}
