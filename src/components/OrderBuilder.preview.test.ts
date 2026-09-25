import { describe, expect, it } from "vitest"
import { formatOrderAddress } from "./OrderBuilder"

describe("OrderBuilder preview", () => {
  it("shows a complete shipping address", () => {
    expect(formatOrderAddress({
      shippingStreet: "160 S. Pullen Blvd",
      shippingCity: "Centralia",
      shippingState: "IL",
      shippingZip: "62801",
      shippingCountry: "USA",
    }, "shipping")).toBe("160 S. Pullen Blvd\nCentralia, IL 62801\nUSA")
  })

  it("falls back to the complete billing address when shipping is absent", () => {
    expect(formatOrderAddress({
      billingStreet: "100 Main St",
      billingCity: "Phoenix",
      billingState: "AZ",
      billingCode: "85001",
    }, "shipping")).toBe("100 Main St\nPhoenix, AZ 85001")
  })
})
