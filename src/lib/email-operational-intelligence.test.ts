import { describe, expect, it } from "vitest"
import { attachmentClassification, extractOperationalEvents } from "./email-operational-intelligence"

describe("email operational intelligence", () => {
  it("extracts a supplier shipment with PO, order, carrier, and tracking", () => {
    const events = extractOperationalEvents(
      "Shipping Notification - CUSTOMER(PO : 9153 / Order No : SR260813-094)",
      "This automatically generated e-mail is to confirm that your order is shipped. Ship Date : 2026-08-17 Ship Type : FEDEX GROUND Tracking No : 467094990340",
      "noreply@gtdiamond.com",
    )
    expect(events[0]).toMatchObject({ eventType: "SHIPMENT_CONFIRMED", data: { poNumber: "9153", salesOrderNumber: "SR260813-094", trackingNumber: "467094990340", carrier: "FEDEX GROUND" } })
  })

  it("extracts freight charge components", () => {
    const events = extractOperationalEvents(
      "Freightquote.com order #1741904012 confirmation",
      "Your order has been placed. Pickup scheduled on Tuesday, 07/07/2026 between 12 PM and 5 PM\nLine Haul $225.04\nFuel Surcharge $74.26\nTotal: $369.30\npallet of blades - 1 pallet, 450 total pounds",
      "freightquote@chrobinson.com",
    )
    expect(events[0]).toMatchObject({ eventType: "FREIGHT_BOOKED", data: { totalCost: 369.3, lineHaul: 225.04, fuelSurcharge: 74.26, weightPounds: 450 } })
  })

  it("treats payment receipts as evidence requiring review", () => {
    const events = extractOperationalEvents("Merchant Email Receipt", "Invoice : 10860\nAmount : 263.65 (USD)\nTransaction Type: Authorization and Capture\nResponse : This transaction has been approved.\nTransaction ID : 81727484136", "noreply@mail.authorize.net")
    expect(events[0]).toMatchObject({ eventType: "PAYMENT_RECEIPT", data: { invoiceNumber: "10860", amount: 263.65, approvalEvidenceOnly: true } })
  })

  it("extracts independent exception events", () => {
    const events = extractOperationalEvents("Purchase Order from TITAN DIAMOND USA (Purchase Order #: 9151)", "We will cancel this order. A 7.5% tariff surcharge applies. There is no tracking attached. Please note our new shipping address.", "orders@example.com")
    expect(events.map(event => event.eventType)).toEqual(expect.arrayContaining(["PURCHASE_ORDER_CANCELLED", "VENDOR_SURCHARGE_NOTICE", "TRACKING_MISSING", "ADDRESS_CHANGE_REQUESTED"]))
  })

  it("classifies operational attachments", () => {
    expect(attachmentClassification("BOL.pdf")).toBe("BILL_OF_LADING")
    expect(attachmentClassification("PalletLabel.pdf")).toBe("PALLET_LABEL")
    expect(attachmentClassification("Return 4x6.pdf")).toBe("RETURN_LABEL")
  })
})
