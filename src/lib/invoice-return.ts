import { financialZohoLineItems } from "./zoho-line-items"

export type ReturnAddress = { line_1: string; line_2: string; city: string; state: string; postal_code: string; country_alpha2: string; contact_name: string; contact_phone: string; company_name: string; contact_email: string }
export type ReturnLine = { lineId: string; itemId: string; name: string; sku: string; quantity: number; unitCredit: number; unitCost: number | null; dropshipped: boolean }
export type ReturnBox = { length: number; width: number; height: number; weight: number }
export type ReturnSnapshot = { origin: ReturnAddress; destination: ReturnAddress; box: ReturnBox; lines: ReturnLine[]; invoiceNumber: string; booksInvoiceId: string; booksCustomerId: string }
// Dynamic Zoho/Easyship boundary; individual business fields are validated below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}

// Office destination confirmed October 8, 2026; independent of dropship origins.
export const RETURN_OFFICE: ReturnAddress = { line_1: "8321 E Evans Road", line_2: "Suite 104", city: "Scottsdale", state: "AZ", postal_code: "85260", country_alpha2: "US", company_name: "Titan Diamond USA", contact_name: "Titan Diamond Returns", contact_phone: "4804598570", contact_email: "" }
export function safeReturnUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : null } catch { return null }
}
export function returnShipmentDetails(value: unknown) {
  const shipment = record(value)
  const labelUrl = safeReturnUrl(shipment.shipping_documents?.find((doc: { category?: string; url?: string }) => doc.category === "label")?.url || shipment.label_url)
  const trackingNumber = String(shipment.trackings?.[0]?.tracking_number || shipment.tracking_number || "") || null
  const labelState = String(shipment.label_state || "pending")
  const ready = ["created", "generated"].includes(labelState) && !!labelUrl && !!trackingNumber
  // A rates array contains alternatives. Only the purchased shipment's exact courier is a cost.
  const purchasedRate = ready && shipment.courier_service?.id && Array.isArray(shipment.rates)
    ? shipment.rates.find((rate: { courier_service?: { id?: string } }) => rate.courier_service?.id === shipment.courier_service.id)
    : null
  const charge = shipment.total_charge ?? shipment.shipment_charge_total ?? purchasedRate?.total_charge
  const currency = shipment.currency || purchasedRate?.currency || shipment.rates?.selected?.currency
  return { labelUrl, trackingNumber, trackingUrl: safeReturnUrl(shipment.trackings?.[0]?.tracking_page_url || shipment.tracking_page_url), labelState,
    ready,
    actualCostCents: (ready || !!shipment.label_paid_at) && currency === "USD" && charge !== undefined && charge !== null && Number.isFinite(Number(charge)) && Number(charge) >= 0 ? Math.round(Number(charge) * 100) : null }
}

export function resolveReturnBooksId(invoice: { zohoId: string; items: unknown; rawData?: unknown }) {
  const items = record(invoice.items), raw = record(invoice.rawData)
  const explicit = [items.booksInvoiceId, items.invoice_id, raw.invoice_id].filter(Boolean).map(String)
  if (new Set(explicit).size > 1) throw new Error("Conflicting Books invoice links. Resolve the invoice mapping before continuing.")
  const id = explicit[0] || invoice.zohoId
  if (!/^\d{10,}$/.test(id || "")) throw new Error("This invoice needs a verified Zoho Books invoice link.")
  return id
}

export function returnLines(items: unknown): ReturnLine[] {
  const doc = record(items)
  return financialZohoLineItems(doc.line_items || doc.lineItems || []).flatMap((line, index) => {
    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return []
    const total = Number(line.item_total ?? Number(line.rate || 0) * quantity)
    if (!Number.isFinite(total) || total < 0) throw new Error("Invoice line amounts must be verified before returning items.")
    const unitCost = line.purchase_rate === undefined || line.purchase_rate === null ? null : Number(line.purchase_rate)
    return [{ lineId: String(line.line_item_id || `local-${index}`), itemId: String(line.item_id || ""), name: String(line.name || line.description || "Invoice item"), sku: String(line.sku || ""), quantity, unitCredit: Math.max(0, total / quantity), unitCost: Number.isFinite(unitCost) && unitCost !== null && unitCost >= 0 ? unitCost : null, dropshipped: line.is_dropshipped_item === true }]
  })
}

export function normalizeReturnAddress(value: unknown): ReturnAddress {
  const data = record(value)
  const text = (key: string, fallback = "") => String(data[key] ?? fallback).trim()
  const country = text("country_alpha2", text("country", "US")).toUpperCase().replace(/[^A-Z]/g, "")
  return { line_1: text("line_1", text("address")), line_2: text("line_2", text("street2")), city: text("city"), state: text("state"), postal_code: text("postal_code", text("zip", text("zipcode"))), country_alpha2: ["USA", "UNITEDSTATES", "UNITEDSTATESOFAMERICA"].includes(country) ? "US" : country, contact_name: text("contact_name", text("attention")), contact_phone: text("contact_phone", text("phone")), company_name: text("company_name"), contact_email: text("contact_email") }
}

export function validateReturnAddress(address: ReturnAddress) {
  if (![address.line_1, address.city, address.state, address.postal_code, address.contact_name, address.contact_phone].every(value => value.trim())) throw new Error("Complete the sender and return-office street, city, state, ZIP, contact and phone.")
  if (/^(suite|ste\.?|unit|#)\s*\w+[\w\s-]*$/i.test(address.line_1)) throw new Error("The return address needs a street address; put the suite in address line 2.")
  if (address.country_alpha2 !== "US") throw new Error("This return flow currently supports US domestic returns. Arrange international customs through Shipping.")
}

export function validateReturnBox(value: unknown): ReturnBox {
  const data = record(value)
  const box = { length: Number(data.length), width: Number(data.width), height: Number(data.height), weight: Number(data.weight) }
  if (!Object.values(box).every(number => Number.isFinite(number) && number >= 0.1 && number <= 1000)) throw new Error("Enter measured package length, width, height in inches and total weight in pounds (0.1–1000).")
  return box
}

export function selectReturnLines(available: ReturnLine[], selections: unknown, reserved: Record<string, number> = {}) {
  if (!Array.isArray(selections) || !selections.length) throw new Error("Select at least one invoice item to return.")
  const seen = new Set<string>()
  return selections.map(selection => {
    const row = record(selection), line = available.find(item => item.lineId === row.lineId), quantity = Number(row.quantity)
    if (!line || seen.has(line.lineId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > line.quantity - (reserved[line.lineId] || 0) + 0.00001) throw new Error("Return quantities must be positive and cannot exceed the unreturned invoice quantity.")
    seen.add(line.lineId)
    return { ...line, quantity }
  })
}

export function returnCreditEstimate(lines: ReturnLine[], responsibility: string, actualFreightCents: number | null) {
  const merchandiseCents = Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitCredit, 0) * 100)
  return { merchandiseCents, freightDeductionCents: responsibility === "CUSTOMER" ? actualFreightCents : 0, proposedNetCents: responsibility === "CUSTOMER" && actualFreightCents === null ? null : Math.max(0, merchandiseCents - (responsibility === "CUSTOMER" ? actualFreightCents || 0 : 0)) }
}

export function returnParcel(snapshot: ReturnSnapshot) {
  const count = snapshot.lines.reduce((sum, line) => sum + line.quantity, 0)
  return { total_actual_weight: snapshot.box.weight, items: snapshot.lines.map(line => ({ description: line.name, category: "home_appliances", quantity: line.quantity, dimensions: { length: snapshot.box.length, width: snapshot.box.width, height: snapshot.box.height }, actual_weight: snapshot.box.weight / count, declared_currency: "USD", declared_customs_value: line.unitCredit })) }
}
