import { describe, expect, it } from "vitest"
import { reconcileStoredInvoiceFinancials } from "./commission-reconciliation"

describe("stored invoice commission reconciliation", () => {
  it("recalculates VIG, profit and 50% commission to cents", () => {
    const result = reconcileStoredInvoiceFinancials({
      sub_total: 1000,
      deadCostSubjectToVig: 400,
      deadCostNoVig: 50,
      additionalCosts: 25,
      ccFees: 20,
    }, 1000, 1.5)
    expect(result).toMatchObject({ deadCostTotal: 475, deadCostPlusVig: 650, profit: 305, deadProfitActual: 505, commission: 152.5 })
  })

  it("blocks invoices without authoritative cost buckets", () => {
    expect(reconcileStoredInvoiceFinancials({ sub_total: 1000 }, 1000, 1.3)).toBeNull()
  })
})
