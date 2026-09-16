import { describe, expect, it } from "vitest"
import {
  applyLedgerEvent, assertApprovalAuthority, calculateResponsibilityShare, calculateWriteOffRecovery, redactRecoveryCase,
  type RecoveryComponent, type ReturnInspection,
} from "../src/lib/write-off-recovery"

const cost = (amountCents: number, key = "cost-1", category = "HISTORICAL_PRODUCT_COST"): RecoveryComponent => ({
  category, direction: "COST", amountCents, approved: true, sourceType: "INVOICE_LINE_HISTORICAL_COST",
  sourceId: "invoice-1", idempotencyKey: key, reason: "Documented historical company cost",
})
const inspection = (status: ReturnInspection["status"], acceptedProductCostCents: number, key = "return-1"): ReturnInspection => ({
  status, historicalProductCostCents: 10_000, acceptedProductCostCents,
  receivedAt: new Date("2026-09-10T00:00:00Z"),
  inspectedAt: status === "ACCEPTED_RESELLABLE" ? new Date("2026-09-11T00:00:00Z") : null,
  inspectedById: status === "ACCEPTED_RESELLABLE" ? "manager-2" : null, idempotencyKey: key,
  sourceType: "WAREHOUSE_RECEIPT", sourceId: "return-authorization-1",
})

describe("write-off recovery", () => {
  it("charges 50% of documented company costs after a full accepted return", () => {
    const result = calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000)], inspections: [inspection("ACCEPTED_RESELLABLE", 10_000)] })
    expect(result).toMatchObject({ originalCostCents: 10_000, acceptedReturnCreditCents: 10_000, netCompanyCostCents: 0, responsibilityChargeCents: 0 })
  })

  it("credits only accepted historical product cost on a partial return", () => {
    const result = calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000)], inspections: [inspection("ACCEPTED_RESELLABLE", 4_000)] })
    expect(result).toMatchObject({ netCompanyCostCents: 6_000, responsibilityChargeCents: 3_000 })
  })

  it("gives no automatic credit for damaged, missing, or unsellable returns", () => {
    for (const status of ["DAMAGED", "MISSING", "UNSELLABLE"] as const) {
      const result = calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000)], inspections: [inspection(status, 0, `return-${status}`)] })
      expect(result.responsibilityChargeCents).toBe(5_000)
    }
    expect(() => calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000)], inspections: [inspection("DAMAGED", 1_000)] })).toThrow(/accepted resellable/i)
  })

  it("applies a later processor refund before the percentage", () => {
    const refund: RecoveryComponent = { ...cost(2_000, "processor-1", "PROCESSOR_REFUND"), direction: "RECOVERY", sourceType: "PROCESSOR_SETTLEMENT" }
    expect(calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000), refund] }).responsibilityChargeCents).toBe(4_000)
    expect(calculateResponsibilityShare(2_000, 5000)).toBe(1_000)
  })

  it("excludes tax, revenue, markup, estimates, and unapproved insurance", () => {
    const excluded = ["SALES_TAX", "REVENUE", "MARKUP", "ESTIMATE", "INSURANCE"].map((category, index) => ({ ...cost(100, `excluded-${index}`, category), approved: false }))
    const result = calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10_000), ...excluded] })
    expect(result).toMatchObject({ originalCostCents: 10_000, excludedCents: 500, responsibilityChargeCents: 5_000 })
  })

  it("supports waiver credits without overwriting the posted debit", () => {
    const posted = applyLedgerEvent(0, "DEBIT", 5_000)
    expect(posted).toBe(5_000)
    expect(applyLedgerEvent(posted, "CREDIT", 5_000)).toBe(0)
  })

  it("rejects duplicate event keys and non-cent amounts", () => {
    expect(() => calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(100, "same"), cost(200, "same")] })).toThrow(/idempotency/i)
    expect(() => calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [cost(10.5)] })).toThrow(/integer-cent/i)
  })

  it("enforces manager approval and segregation of duties", () => {
    expect(() => assertApprovalAuthority({ role: "AGENT", actorId: "a", creatorId: "b", responsibleRepId: "c" })).toThrow(/manager/i)
    expect(() => assertApprovalAuthority({ role: "COLLECTIONS", actorId: "a", creatorId: "b", responsibleRepId: "c" })).toThrow(/manager/i)
    expect(() => assertApprovalAuthority({ role: "ADMIN", actorId: "a", creatorId: "a", responsibleRepId: "c" })).toThrow(/segregation/i)
    expect(() => assertApprovalAuthority({ role: "MANAGER", actorId: "a", creatorId: "b", submittedById: "b", responsibleRepId: "c" })).not.toThrow()
  })

  it("redacts evidence, source IDs, and actor IDs from salesperson views", () => {
    const record = { amountCents: 100, evidence: { private: true }, sourceId: "provider-1", actorId: "manager-1", reason: "approved" }
    expect(redactRecoveryCase(record, false)).toEqual({ amountCents: 100, reason: "approved" })
    expect(redactRecoveryCase(record, true)).toEqual(record)
  })

  it("requires auditable source and reason fields", () => {
    expect(() => calculateWriteOffRecovery({ responsibilityRateBps: 5000, components: [{ ...cost(100), reason: "" }] })).toThrow(/source and reason/i)
  })

  it("fails closed without approved authoritative historical product cost", () => {
    expect(() => calculateWriteOffRecovery({
      responsibilityRateBps: 5000,
      components: [{ ...cost(10_000), category: "OUTBOUND_FREIGHT" }],
    })).toThrow(/historical product cost is required/i)
    expect(() => calculateWriteOffRecovery({
      responsibilityRateBps: 5000,
      components: [{ ...cost(10_000), approved: false }],
    })).toThrow(/historical product cost is required/i)
    expect(() => calculateWriteOffRecovery({
      responsibilityRateBps: 5000,
      components: [{ ...cost(10_000), sourceType: "CATALOG_FALLBACK" }],
    })).toThrow(/historical product cost is required/i)
  })
})
