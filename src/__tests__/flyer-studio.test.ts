import { describe, expect, it } from "vitest"
import { extractJsonLdProducts, extractMeta } from "@/lib/flyer-scrape"
import { FLYER_CAMPAIGN_TYPES, FLYER_CATALOGS } from "@/lib/flyer-studio-config"
import { calculatePromotionFinancials } from "@/lib/promotion-financials"

describe("Flyer Studio retailer extraction", () => {
  it("extracts Product JSON-LD from a graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "WebPage", name: "Example" },
        { "@type": "Product", name: "14 in. Concrete Saw", sku: "SAW-14", offers: { price: "799.00", priceCurrency: "USD" } },
      ],
    })}</script>`
    expect(extractJsonLdProducts(html)).toEqual([
      expect.objectContaining({ name: "14 in. Concrete Saw", sku: "SAW-14" }),
    ])
  })

  it("uses Open Graph metadata regardless of attribute order", () => {
    expect(extractMeta('<meta content="Contractor Saw" property="og:title">', "og:title")).toBe("Contractor Saw")
    expect(extractMeta('<meta property="og:title" content="Contractor &amp; Masonry Saw">', "og:title")).toBe("Contractor & Masonry Saw")
  })
})

describe("Flyer Studio extension points", () => {
  it("keeps blade catalog matching narrow", () => {
    const catalog = FLYER_CATALOGS.find((item) => item.id === "diamond-cutting-blades")!
    expect(catalog.matches({ name: "14-inch Diamond Blade", category: "Professional Blades" })).toBe(true)
    expect(catalog.matches({ name: "Diamond Core Bit", category: "Core Bits" })).toBe(false)
  })

  it("exposes every requested campaign channel", () => {
    expect(FLYER_CAMPAIGN_TYPES.map((item) => item.id)).toEqual(["SMS", "EMAIL", "PHONE"])
  })
})

describe("Flyer Studio promotion financials", () => {
  it("includes every fulfillment cost and customer value component", () => {
    expect(calculatePromotionFinancials({
      sellingPrice: 299.99,
      bladeLines: [{ quantity: 2, unitCost: 40, unitRetail: 99.99 }],
      giveawayCost: 50, giveawayRetail: 129.99,
      packagingCost: 5, handlingCost: 8, shippingEstimate: 25,
      freeShipping: true, paymentFeePercent: 3,
    })).toEqual(expect.objectContaining({
      bladeCost: 80, giveawayCost: 50, shippingCost: 25,
      paymentFee: 9, totalCost: 177, grossProfit: 122.99,
      customerValue: 354.97, customerSavings: 54.98,
    }))
  })

  it("does not charge the promotion for customer-paid shipping", () => {
    const result = calculatePromotionFinancials({ sellingPrice: 100, bladeLines: [], giveawayCost: 0, giveawayRetail: 0, packagingCost: 0, handlingCost: 0, shippingEstimate: 30, freeShipping: false })
    expect(result.shippingCost).toBe(0)
  })
})
