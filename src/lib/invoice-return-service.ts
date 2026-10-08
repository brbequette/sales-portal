import { authenticateFunction } from "../../netlify/functions/lib/auth-middleware"
import type { Handler } from "@netlify/functions"
import { Prisma } from "@prisma/client"
import { prisma } from "../../netlify/functions/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../netlify/functions/lib/zoho-auth"
import { isAdminRole } from "./roles"
import { EASYSHIP_API_URL, getEasyshipRates, inToCm, lbsToKg, type EasyshipRate } from "./easyship"
import { normalizeReturnAddress, record, resolveReturnBooksId, RETURN_OFFICE, returnCreditEstimate, returnLines, returnParcel, returnShipmentDetails, selectReturnLines, validateReturnAddress, validateReturnBox, type ReturnSnapshot } from "./invoice-return"

// Return shipments use the current public endpoint even on legacy Enterprise configurations.
const RETURN_API_URL = EASYSHIP_API_URL.replace("https://enterprise-api.easyship.com", "https://public-api.easyship.com")
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) })
async function easyship(path: string, body?: unknown, key?: string) {
  if (!process.env.EASYSHIP_API_KEY) throw new Error("Easyship is not configured.")
  const response = await fetch(`${RETURN_API_URL}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${process.env.EASYSHIP_API_KEY}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Easyship returned ${response.status}. Check the saved return before attempting another shipment.`)
  return response.json()
}
async function books(path: string) {
  const token = await getZohoAccessToken()
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3${path}?organization_id=${ZOHO_ORGANIZATION_ID}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  if (!response.ok || data.code !== 0) throw new Error("Zoho Books could not verify this record. Check its Books ID.")
  return data
}

export const returnHandler: Handler = async event => {
  if (event.httpMethod === "OPTIONS") return reply(204, null)
  if (!["GET", "POST"].includes(event.httpMethod)) return reply(405, { error: "Method not allowed" })
  try {
    const user = await authenticateFunction(event)
    const actorId = user.dbId || user.userId
    const body = event.httpMethod === "GET" ? event.queryStringParameters || {} : JSON.parse(event.body || "{}")
    if (!actorId || typeof body.invoiceId !== "string") return reply(400, { error: "Invoice is required." })
    const invoice = await prisma.invoice.findFirst({ where: { OR: [{ id: body.invoiceId }, { zohoId: body.invoiceId }] }, include: { account: { select: { ownerId: true } } } })
    if (!invoice) return reply(404, { error: "Invoice not found." })
    const manager = await prisma.systemSetting.findUnique({ where: { key: "collections_manager_id" } })
    const canManage = isAdminRole(user.role) || manager?.value === actorId
    if (!canManage && invoice.account.ownerId !== actorId) return reply(403, { error: "This invoice belongs to another representative." })
    if (event.httpMethod === "POST" && user.role?.toUpperCase() === "VIEWER") return reply(403, { error: "View-only access cannot change returns." })
    const items = record(invoice.items)
    const booksInvoiceId = resolveReturnBooksId(invoice)
    if (event.httpMethod === "GET") {
      const origin = normalizeReturnAddress(items.shipping_address || items.billing_address)
      origin.company_name ||= String(items.customer_name || "")
      return reply(200, { success: true, origin, destination: RETURN_OFFICE, lines: returnLines(items), returns: await prisma.invoiceReturn.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "desc" } }), canManage, booksInvoiceId })
    }
    const action = body.action
    if (action === "quote") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.returnId || ""))) throw new Error("A return request ID is required.")
      if (!["TITAN", "CUSTOMER"].includes(body.costResponsibility)) throw new Error("Choose who pays return freight.")
      const reason = String(body.reason || "").trim()
      if (!reason || reason.length > 1000) throw new Error("Enter a return reason of up to 1,000 characters.")
      const origin = normalizeReturnAddress(body.origin), destination = { ...RETURN_OFFICE }
      validateReturnAddress(origin); validateReturnAddress(destination)
      const box = validateReturnBox(body.box)
      const live = (await books(`/invoices/${booksInvoiceId}`)).invoice
      if (String(live?.invoice_id) !== booksInvoiceId || live.currency_code !== "USD") throw new Error("A verified USD Books invoice is required.")
      const snapshot: ReturnSnapshot = { origin, destination, box, lines: [], invoiceNumber: String(live.invoice_number), booksInvoiceId, booksCustomerId: String(live.customer_id) }
      const created = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoice.id} FOR UPDATE`
        const existing = await tx.invoiceReturn.findUnique({ where: { id: body.returnId } })
        if (existing) { if (existing.invoiceId !== invoice.id) throw new Error("Return ID already in use."); return { row: existing, fresh: false } }
        const others = await tx.invoiceReturn.findMany({ where: { invoiceId: invoice.id, status: { notIn: ["CANCELLED", "QUOTE_FAILED"] } } })
        const reserved: Record<string, number> = {}
        for (const other of others) for (const line of (other.snapshot as unknown as ReturnSnapshot).lines) reserved[line.lineId] = (reserved[line.lineId] || 0) + line.quantity
        snapshot.lines = selectReturnLines(returnLines(live), body.lines, reserved)
        const row = await tx.invoiceReturn.create({ data: { id: body.returnId, invoiceId: invoice.id, createdById: actorId, reason, snapshot: json(snapshot), costResponsibility: body.costResponsibility } })
        return { row, fresh: true }
      })
      if (!created.fresh) return reply(200, { success: true, return: created.row })
      try {
        const rates = (await getEasyshipRates({ origin_address: origin, destination_address: destination, parcels: [returnParcel(snapshot)] }, RETURN_API_URL)).filter(rate => rate.currency === "USD" && rate.courierServiceId && Number.isFinite(rate.totalCharge) && rate.totalCharge > 0).sort((a, b) => a.totalCharge - b.totalCharge)
        if (!rates.length) throw new Error("No USD services are available for this address and package.")
        const changed = await prisma.invoiceReturn.updateMany({ where: { id: created.row.id, status: "QUOTING" }, data: { rates: json(rates), quotedAt: new Date(), status: "QUOTED" } })
        if (!changed.count) throw new Error("This return quote was cancelled.")
        return reply(200, { success: true, return: await prisma.invoiceReturn.findUnique({ where: { id: created.row.id } }) })
      } catch (error) {
        await prisma.invoiceReturn.updateMany({ where: { id: created.row.id, status: "QUOTING" }, data: { status: "QUOTE_FAILED", lastError: (error as Error).message } })
        throw error
      }
    }
    if (typeof body.returnId !== "string") throw new Error("Choose a saved return.")
    const row = await prisma.invoiceReturn.findUnique({ where: { id: body.returnId } })
    if (!row || row.invoiceId !== invoice.id) return reply(404, { error: "Return not found for this invoice." })
    const snapshot = row.snapshot as unknown as ReturnSnapshot
    if (action === "cancel") {
      const changed = await prisma.invoiceReturn.updateMany({ where: { id: row.id, status: { in: ["QUOTING", "QUOTED", "QUOTE_FAILED"] }, purchaseRequestedAt: null }, data: { status: "CANCELLED" } })
      if (!changed.count) throw new Error("A requested label cannot be cancelled here. Reconcile it with Easyship first.")
    } else if (action === "purchase") {
      const rate = (row.rates as unknown as EasyshipRate[])?.find(rate => rate.courierServiceId === body.courierServiceId)
      if (row.status !== "QUOTED") return reply(200, { success: true, return: row })
      if (!rate || !row.quotedAt || Date.now() - row.quotedAt.getTime() > 15 * 60000) throw new Error("Quote expired or unavailable. Cancel this quote and request fresh rates.")
      const approvedCents = Math.round(rate.totalCharge * 100)
      if (body.approvedCostCents !== approvedCents) throw new Error("Review and approve the selected label price.")
      const claimed = await prisma.invoiceReturn.updateMany({ where: { id: row.id, status: "QUOTED", purchaseRequestedAt: null }, data: { status: "PURCHASE_REQUESTED", purchaseRequestedAt: new Date(), courierServiceId: rate.courierServiceId, quotedCostCents: approvedCents } })
      if (claimed.count) {
        try {
          const parcel = returnParcel(snapshot)
          const result = await easyship("/shipments", { return: true, origin_address: snapshot.origin, destination_address: snapshot.destination, order_data: { platform_order_number: `RMA-${row.id}` }, courier_settings: { courier_service_id: rate.courierServiceId, allow_fallback: false, apply_shipping_rules: false }, shipping_settings: { buy_label: false }, parcels: [{ total_actual_weight: lbsToKg(snapshot.box.weight), box: { length: inToCm(snapshot.box.length), width: inToCm(snapshot.box.width), height: inToCm(snapshot.box.height) }, items: parcel.items.map(item => ({ description: item.description, category: item.category, quantity: item.quantity, actual_weight: lbsToKg(item.actual_weight), declared_currency: "USD", declared_customs_value: item.declared_customs_value || 0.10 })) }] }, `return-${row.id}-shipment`)
          const shipment = result.shipment || result.shipments?.[0]
          const shipmentId = shipment?.easyship_shipment_id || shipment?.id
          if (!shipmentId) throw new Error("Shipment creation is unconfirmed. Reconcile by the saved RMA reference; do not create a replacement.")
          await prisma.invoiceReturn.update({ where: { id: row.id }, data: { shipmentId: String(shipmentId) } })
          const selected = Array.isArray(shipment.rates) ? shipment.rates.find((r: { courier_service?: { id?: string } }) => r.courier_service?.id === rate.courierServiceId) : shipment.rates?.selected
          if (!selected || selected.currency !== "USD" || !Number.isFinite(Number(selected.total_charge)) || Math.round(Number(selected.total_charge) * 100) !== approvedCents) throw new Error("Shipment price could not be matched to your approval. No label purchase was requested. Review this shipment in Easyship.")
          const bought = await easyship(`/shipments/${encodeURIComponent(shipmentId)}/label`, { courier_service_id: rate.courierServiceId }, `return-${row.id}-label`)
          const { ready, ...fields } = returnShipmentDetails(bought.shipment || bought.shipments?.[0] || {})
          await prisma.invoiceReturn.update({ where: { id: row.id }, data: { ...fields, status: ready ? "LABEL_READY" : "LABEL_PENDING", lastError: null } })
        } catch (error) {
          await prisma.invoiceReturn.update({ where: { id: row.id }, data: { status: "RECONCILE_REQUIRED", lastError: (error as Error).message } })
        }
      }
    } else if (action === "refresh") {
      if (!row.shipmentId) throw new Error(`No saved shipment ID. Check Easyship for reference RMA-${row.id}. Do not purchase another label.`)
      const result = await easyship(`/shipments/${encodeURIComponent(row.shipmentId)}`)
      const shipment = result.shipment || result
      if (String(shipment.easyship_shipment_id || shipment.id) !== row.shipmentId) throw new Error("Easyship returned a different shipment.")
      const { ready, ...fields } = returnShipmentDetails(shipment)
      const actualCostCents = fields.actualCostCents ?? row.actualCostCents
      const proposedCreditCents = row.status === "CREDIT_PENDING" ? returnCreditEstimate(record(row.inspection).accepted || [], row.costResponsibility, actualCostCents).proposedNetCents : row.proposedCreditCents
      await prisma.invoiceReturn.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { ...fields, actualCostCents, proposedCreditCents, ...(row.receivedAt ? {} : { status: ready ? "LABEL_READY" : "LABEL_PENDING" }), lastError: null } })
    } else if (action === "receive") {
      if (!canManage) return reply(403, { error: "A collections manager must record the inspection." })
      if (row.status !== "LABEL_READY") throw new Error("Receive an existing completed label shipment before recording inspection.")
      const accepted = Array.isArray(body.lines) && body.lines.length ? selectReturnLines(snapshot.lines, body.lines) : []
      const notes = String(body.notes || "").trim()
      if (!notes || notes.length > 2000) throw new Error("Record the received condition and inspection notes (up to 2,000 characters).")
      const estimate = returnCreditEstimate(accepted, row.costResponsibility, row.actualCostCents)
      const recoveredCostCents = accepted.every(line => line.unitCost !== null) ? Math.round(accepted.reduce((sum, line) => sum + line.quantity * line.unitCost!, 0) * 100) : null
      const changed = await prisma.invoiceReturn.updateMany({ where: { id: row.id, status: "LABEL_READY", receivedAt: null }, data: { receivedAt: new Date(), status: "CREDIT_PENDING", inspection: json({ accepted, notes, inspectedById: actorId }), recoveredCostCents, proposedCreditCents: estimate.proposedNetCents } })
      if (!changed.count) throw new Error("Inspection was already recorded. Reload the return.")
    } else if (action === "close-no-credit") {
      if (!canManage) return reply(403, { error: "A collections manager must close the return." })
      if (row.status !== "CREDIT_PENDING" || row.proposedCreditCents !== 0) throw new Error("Only an inspected return with zero proposed credit can be closed without credit.")
      await prisma.invoiceReturn.updateMany({ where: { id: row.id, status: "CREDIT_PENDING" }, data: { status: "CLOSED_NO_CREDIT", creditedCents: 0 } })
    } else if (action === "reconcile-credit") {
      if (!canManage) return reply(403, { error: "A collections manager must reconcile credit." })
      if (row.status !== "CREDIT_PENDING" || !/^\d{10,}$/.test(String(body.creditNoteId || ""))) throw new Error("Receive and inspect the return, then enter its posted Books credit-note ID.")
      const credit = (await books(`/creditnotes/${body.creditNoteId}`)).creditnote
      const applications = await books(`/creditnotes/${body.creditNoteId}/invoices`)
      const amount = (applications.invoices_credited || []).filter((item: { invoice_id?: string; creditnote_id?: string }) => String(item.invoice_id) === snapshot.booksInvoiceId && String(item.creditnote_id) === String(body.creditNoteId)).reduce((sum: number, item: { credited_amount?: number }) => sum + Number(item.credited_amount), 0)
      if (String(credit?.creditnote_id) !== String(body.creditNoteId) || String(credit?.customer_id) !== snapshot.booksCustomerId || credit.currency_code !== "USD" || !Number.isFinite(amount) || amount <= 0) throw new Error("This credit must belong to the same customer and be applied to this invoice in USD.")
      if (!Number.isInteger(body.expectedCreditCents) || body.expectedCreditCents !== Math.round(amount * 100)) throw new Error("The applied Books credit does not match the credit amount entered for this return.")
      const live = (await books(`/invoices/${snapshot.booksInvoiceId}`)).invoice
      if (String(live?.invoice_id) !== snapshot.booksInvoiceId || !Number.isFinite(Number(live.balance))) throw new Error("The current Books invoice balance could not be verified.")
      await prisma.invoiceReturn.updateMany({ where: { id: row.id, status: "CREDIT_PENDING" }, data: { creditNoteId: String(body.creditNoteId), creditedCents: Math.round(amount * 100), status: "CREDIT_VERIFIED", inspection: json({ ...record(row.inspection), creditVerifiedById: actorId, creditVerifiedAt: new Date().toISOString(), booksBalanceAtVerification: Number(live.balance) }) } })
    } else throw new Error("Choose a return action. Review rates before purchasing a label.")
    return reply(200, { success: true, return: await prisma.invoiceReturn.findUnique({ where: { id: row.id } }) })
  } catch (error) { return reply(400, { error: error instanceof Error ? error.message : "Unable to process return." }) }
}
