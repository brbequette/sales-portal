import { describe, expect, it } from "vitest"
import { normalizeReturnAddress, resolveReturnBooksId, RETURN_OFFICE, returnCreditEstimate, returnLines, returnShipmentDetails, selectReturnLines, validateReturnAddress, validateReturnBox } from "./invoice-return"
const line = { lineId: "paid", itemId: "a", name: "Blade", sku: "B", quantity: 2, unitCredit: 299.99, unitCost: 88, dropshipped: true }
describe("invoice return rules", () => {
  it("uses the Books ID rather than a local invoice ID", () => expect(resolveReturnBooksId({ zohoId: "1254360000040824889", items: {} })).toBe("1254360000040824889"))
  it("rejects conflicting links", () => expect(() => resolveReturnBooksId({ zohoId: "crm", items: { invoice_id: "1254360000040824889", booksInvoiceId: "1254360000040824000" } })).toThrow("Conflicting"))
  it("rejects local IDs as Books links", () => expect(() => resolveReturnBooksId({ zohoId: "local-invoice", items: {} })).toThrow("verified"))
  it("recognizes Books zipcode and U.S.A.", () => expect(normalizeReturnAddress({ address: "123 Test St", zipcode: "53002", country: "U.S.A" })).toMatchObject({ line_1: "123 Test St", postal_code: "53002", country_alpha2: "US" }))
  it("always uses the confirmed full Scottsdale office", () => { expect(RETURN_OFFICE).toMatchObject({ line_1: "8321 E Evans Road", line_2: "Suite 104", postal_code: "85260" }); expect(() => validateReturnAddress(RETURN_OFFICE)).not.toThrow() })
  it("rejects a suite as the entire address", () => expect(() => validateReturnAddress({ ...RETURN_OFFICE, line_1: "SUITE 104" })).toThrow("street"))
  it.each([{}, { length: 10, width: 10, height: 10, weight: 0 }, { length: "NaN", width: 10, height: 10, weight: 1 }])("requires measured dimensions and weight", box => expect(() => validateReturnBox(box)).toThrow())
  it("preserves free promotional items and separates paid lines", () => { const rows = returnLines({ line_items: [{ line_item_id: "free", name: "Blade", quantity: 1, rate: 0, item_total: 0, purchase_rate: 88 }, { line_item_id: "paid", name: "Blade", quantity: 2, rate: 299.99, item_total: 599.98 }] }); expect(rows.map(row => row.unitCredit)).toEqual([0, 299.99]); expect(rows[1].unitCost).toBeNull() })
  it("prevents duplicate and overlapping quantities", () => { expect(() => selectReturnLines([line], [{ lineId: "paid", quantity: 2 }], { paid: 1 })).toThrow(); expect(() => selectReturnLines([line], [{ lineId: "paid", quantity: 1 }, { lineId: "paid", quantity: 1 }])).toThrow() })
  it("allows partial returns", () => expect(selectReturnLines([line], [{ lineId: "paid", quantity: 1 }])[0].quantity).toBe(1))
  it("keeps Titan freight separate from merchandise credit", () => expect(returnCreditEstimate([line], "TITAN", 1700)).toEqual({ merchandiseCents: 59998, freightDeductionCents: 0, proposedNetCents: 59998 }))
  it("deducts customer freight only when confirmed", () => { expect(returnCreditEstimate([line], "CUSTOMER", null).proposedNetCents).toBeNull(); expect(returnCreditEstimate([line], "CUSTOMER", 1700).proposedNetCents).toBe(58298) })
  it("does not mistake a provider dashboard or packing slip for a label", () => expect(returnShipmentDetails({ label_state: "pending", shipping_documents: [{ category: "packing_slip", url: "https://example.test/slip" }] })).toMatchObject({ ready: false, labelUrl: null, actualCostCents: null }))
  it("requires label state, printable URL and tracking", () => { expect(returnShipmentDetails({ label_state: "created", label_url: "https://example.test/label", tracking_number: "123", currency: "USD", total_charge: 17.25 })).toMatchObject({ ready: true, actualCostCents: 1725 }); expect(returnShipmentDetails({ label_state: "created", label_url: "javascript:alert(1)", tracking_number: "123" }).ready).toBe(false) })
  it("records only the purchased courier rate from the production shipment shape", () => {
    const shipment = { label_state: "generated", label_url: "https://example.test/label", tracking_number: "T1", currency: "USD", courier_service: { id: "chosen" }, rates: [{ courier_service: { id: "alternative" }, total_charge: 5 }, { courier_service: { id: "chosen" }, total_charge: 17 }] }
    expect(returnShipmentDetails(shipment).actualCostCents).toBe(1700)
    expect(returnShipmentDetails({ ...shipment, label_state: "pending" }).actualCostCents).toBeNull()
  })
  it("does not book a quoted amount as paid freight while label payment is unconfirmed", () => expect(returnShipmentDetails({ label_state: "pending", total_charge: 17, currency: "USD" }).actualCostCents).toBeNull())
  it("never treats an unconfirmed currency as USD cost", () => expect(returnShipmentDetails({ total_charge: 17 }).actualCostCents).toBeNull())
})
