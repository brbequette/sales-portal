import { describe, expect, it } from "vitest"
import { isCommissionLedgerEligible } from "./commission-ledger-period"

describe("commission ledger opening boundary", () => {
  it("excludes pre-2025 invoices even when paid later", () => {
    expect(isCommissionLedgerEligible({ issueDate: "2024-12-31", status: "Paid" })).toBe(false)
  })

  it("includes eligible invoices created on or after the opening date", () => {
    expect(isCommissionLedgerEligible({ issueDate: "2025-01-01", status: "Paid" })).toBe(true)
  })

  it("excludes orphaned invoices", () => {
    expect(isCommissionLedgerEligible({ issueDate: "2026-07-14", status: "Orphaned" })).toBe(false)
  })
})
