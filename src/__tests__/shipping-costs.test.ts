import { describe, expect, it } from "vitest"
import { aggregateShippingCosts } from "@/lib/shipping-costs"

describe("aggregateShippingCosts", () => {
  it("adds distinct package and manual freight costs", () => {
    const result = aggregateShippingCosts({
      packages: [{ zohoId: "p1", packageNumber: "PKG-1", shippingCharge: 12.5 }],
      allocations: [{ id: "a1", carrier: "Vendor freight", cost: 8.25, itemSkus: ["SKU-1"] }],
    })
    expect(result.total).toBe(20.75)
    expect(result.breakdown).toContain("PKG-1")
    expect(result.breakdown).toContain("Vendor freight")
  })

  it("does not count a manual allocation twice when its tracking is already a package", () => {
    const result = aggregateShippingCosts({
      packages: [{ zohoId: "p1", trackingNumber: "1Z-ABC", shippingCharge: 15 }],
      allocations: [{ id: "a1", trackingNumber: "1ZABC", cost: 15 }],
    })
    expect(result.total).toBe(15)
  })

  it("preserves a legacy amount not represented by detailed sources", () => {
    const result = aggregateShippingCosts({
      legacyCost: 30,
      packages: [{ zohoId: "p1", shippingCharge: 20 }],
    })
    expect(result.total).toBe(30)
    expect(result.breakdown).toContain("Unitemized prior shipping")
  })

  it("uses stored unitemized cost instead of retaining a removed prior package", () => {
    const result = aggregateShippingCosts({
      legacyCost: 30,
      priorRollup: { total: 30, unitemizedCost: 5 },
      packages: [{ zohoId: "p1", shippingCharge: 20 }],
    })
    expect(result.total).toBe(25)
  })
})