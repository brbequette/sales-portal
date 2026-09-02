import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

export type OperationalEventDraft = {
  eventType: string
  confidence: number
  effectiveAt?: Date
  summary: string
  data: Record<string, unknown>
}

const first = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

const money = (value?: string) => value ? Number(value.replace(/[$,\s]/g, "")) : undefined
const dateValue = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined

export function plainTextFromHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function commonReferences(subject: string, body: string) {
  const text = `${subject}\n${body}`
  return {
    poNumber: first(text, [/(?:customer\s*)?p\/?o\s*(?:number|no|#)?\s*[:#-]?\s*(\d{3,10})/i, /purchase order\s*#?\s*[:#-]?\s*(\d{3,10})/i]),
    invoiceNumber: first(text, [/invoice\s*(?:number|no|#)?\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    salesOrderNumber: first(text, [/(?:sales\s*)?order\s*(?:number|no|#)?\s*[:#-]?\s*([A-Z]{0,4}\d[A-Z0-9-]{2,30})/i]),
    trackingNumber: first(text, [/tracking\s*(?:number|no|#)?\s*[:#-]?\s*([A-Z0-9]{8,30})/i, /\b(1Z[A-Z0-9]{16})\b/i]),
  }
}

export function extractOperationalEvents(subject: string, body: string, fromAddress: string): OperationalEventDraft[] {
  const text = `${subject}\n${body}`
  const lower = text.toLowerCase()
  const refs = commonReferences(subject, body)
  const events: OperationalEventDraft[] = []
  const shipDateText = first(text, [/ship date\s*:\s*(\d{4}-\d{2}-\d{2})/i, /completed on\s+(\d{4}-\d{2}-\d{2})/i])
  const carrierRaw = first(text, [/(?:carrier|courier|ship type)\s*:\s*([^\n\r]+)/i])
  const carrier = carrierRaw?.split(/\s+(?=(?:tracking|ship to|order|customer)\s*(?:number|no|#|:))/i)[0]?.trim()
  const totalText = first(text, [/(?:grand\s*)?total\s*:\s*\$?([\d,]+\.\d{2})/i])

  if (/confirm that your order is shipped|shipping notification|has been shipped/i.test(text)) {
    events.push({
      eventType: "SHIPMENT_CONFIRMED",
      confidence: refs.trackingNumber ? 0.96 : 0.82,
      effectiveAt: dateValue(shipDateText),
      summary: `Shipment confirmation${refs.poNumber ? ` for PO ${refs.poNumber}` : ""}${refs.trackingNumber ? ` with tracking ${refs.trackingNumber}` : " without tracking"}`,
      data: { ...refs, carrier, shipDate: shipDateText, sourceSender: fromAddress },
    })
  }

  if (/order has been placed|pickup scheduled|bill of lading|line haul|fuel surcharge/i.test(text)) {
    const lineHaul = money(first(text, [/line haul\s*\$?([\d,]+\.\d{2})/i]))
    const fuelSurcharge = money(first(text, [/fuel surcharge\s*\$?([\d,]+\.\d{2})/i]))
    const weight = money(first(text, [/(\d[\d,]*(?:\.\d+)?)\s*(?:total\s*)?pounds/i]))
    const pickup = first(text, [/pickup scheduled on\s+([^\n\r]+)/i])
    const estimatedDelivery = first(text, [/estimated delivery by\s+([^\n\r]+)/i])
    events.push({
      eventType: "FREIGHT_BOOKED",
      confidence: totalText && (refs.salesOrderNumber || refs.poNumber) ? 0.95 : 0.76,
      summary: `Freight booked${totalText ? ` for $${money(totalText)?.toFixed(2)}` : ""}`,
      data: { ...refs, carrier, totalCost: money(totalText), lineHaul, fuelSurcharge, weightPounds: weight, pickupWindow: pickup, estimatedDelivery },
    })
  }

  if (/authorization and capture|transaction has been approved|merchant email receipt/i.test(text)) {
    const amountText = first(text, [/amount\s*:\s*([\d,]+\.\d{2})/i])
    const transactionId = first(text, [/transaction id\s*:\s*([A-Z0-9-]+)/i])
    events.push({
      eventType: "PAYMENT_RECEIPT",
      confidence: refs.invoiceNumber && transactionId ? 0.94 : 0.72,
      summary: `Payment receipt${refs.invoiceNumber ? ` for invoice ${refs.invoiceNumber}` : ""}${amountText ? ` in the amount of $${money(amountText)?.toFixed(2)}` : ""}`,
      data: { ...refs, amount: money(amountText), transactionId, approvalEvidenceOnly: true },
    })
  }

  if (/payment reminder.*not sent|no contacts for the customer|missing.*email address/i.test(text)) {
    events.push({ eventType: "CUSTOMER_CONTACT_MISSING", confidence: 0.96, summary: `Customer communication failed${refs.invoiceNumber ? ` for invoice ${refs.invoiceNumber}` : ""}`, data: refs })
  }

  if (/return (?:tag|label)|product return|return shipping label/i.test(text)) {
    events.push({ eventType: "RETURN_INITIATED", confidence: refs.invoiceNumber ? 0.92 : 0.7, summary: `Product return initiated${refs.invoiceNumber ? ` for invoice ${refs.invoiceNumber}` : ""}`, data: refs })
  }

  if (/awaiting approval|once approved we can ship/i.test(text)) {
    events.push({ eventType: "PURCHASE_ORDER_APPROVAL_REQUIRED", confidence: 0.91, summary: `Supplier is waiting for approval${refs.poNumber ? ` on PO ${refs.poNumber}` : ""}`, data: refs })
  }

  if (/cancel(?:led| this order)|will cancel/i.test(text)) {
    events.push({ eventType: "PURCHASE_ORDER_CANCELLED", confidence: 0.9, summary: `Supplier reported a purchase-order cancellation${refs.poNumber ? ` for PO ${refs.poNumber}` : ""}`, data: refs })
  }

  const tariff = money(first(text, [/(\d+(?:\.\d+)?)%\s*tariff surcharge/i]))
  if (tariff !== undefined) {
    events.push({ eventType: "VENDOR_SURCHARGE_NOTICE", confidence: 0.94, summary: `Vendor announced a ${tariff}% tariff surcharge`, data: { ...refs, tariffPercent: tariff, sourceSender: fromAddress } })
  }

  if (/no tracking attached|tracking (?:is )?missing/i.test(text)) {
    events.push({ eventType: "TRACKING_MISSING", confidence: 0.92, summary: `Shipment notice is missing tracking${refs.salesOrderNumber ? ` for order ${refs.salesOrderNumber}` : ""}`, data: refs })
  }

  if (/new (?:mailing|shipping) address|address (?:has )?changed/i.test(lower)) {
    events.push({ eventType: "ADDRESS_CHANGE_REQUESTED", confidence: 0.88, summary: "A customer requested an address change", data: refs })
  }

  return events
}

export async function matchOperationalEvent(data: Record<string, unknown>) {
  const invoiceNumber = String(data.invoiceNumber || "").trim()
  const salesOrderNumber = String(data.salesOrderNumber || "").trim()
  const poNumber = String(data.poNumber || "").trim()
  const trackingNumber = String(data.trackingNumber || "").trim()

  const invoice = invoiceNumber ? await prisma.invoice.findFirst({ where: { invoiceNumber } }) : null
  const salesOrder = salesOrderNumber ? await prisma.salesOrder.findFirst({ where: { OR: [
    { rawData: { path: ["salesorder_number"], equals: salesOrderNumber } },
    { items: { path: ["salesorder_number"], equals: salesOrderNumber } },
  ] } }) : null
  const purchaseOrder = poNumber ? await prisma.purchaseOrder.findFirst({ where: { referenceNumber: poNumber } }) : null
  const pkg = trackingNumber ? await prisma.package.findFirst({ where: { trackingNumber } }) : null

  const matches = [invoice, salesOrder, purchaseOrder, pkg].filter(Boolean).length
  return {
    invoiceId: invoice?.id,
    salesOrderId: salesOrder?.id,
    purchaseOrderId: purchaseOrder?.id,
    packageId: pkg?.id,
    accountId: invoice?.accountId || salesOrder?.accountId,
    matchMethod: invoice ? "INVOICE_NUMBER" : purchaseOrder ? "PURCHASE_ORDER_NUMBER" : salesOrder ? "SALES_ORDER_NUMBER" : pkg ? "TRACKING_NUMBER" : undefined,
    matchConfidence: matches === 1 ? 0.98 : matches > 1 ? 0.9 : 0,
    conflictReason: matches === 0 ? "No matching local document was found." : undefined,
  }
}

export function eventFingerprint(emailExternalId: string, event: OperationalEventDraft, index: number) {
  return createHash("sha256").update(`${emailExternalId}|${event.eventType}|${index}|${JSON.stringify(event.data)}`).digest("hex")
}

export function attachmentClassification(name: string) {
  const value = name.toLowerCase()
  if (value.includes("bol") || value.includes("bill of lading")) return "BILL_OF_LADING"
  if (value.includes("pallet")) return "PALLET_LABEL"
  if (value.includes("return") || value.includes("4x6")) return "RETURN_LABEL"
  if (value.includes("acknowledg") || value.includes("sales order")) return "SALES_ACKNOWLEDGMENT"
  if (value.includes("invoice")) return "VENDOR_INVOICE"
  if (value.endsWith(".pdf")) return "PDF_OTHER"
  return "OTHER"
}
