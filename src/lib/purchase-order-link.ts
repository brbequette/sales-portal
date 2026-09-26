import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type Document = Record<string, any>
const normalize = (value: unknown) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
const providerId = (value: unknown): value is string => typeof value === 'string' && /^\d{15,20}$/.test(value)
function address(value: Document = {}) {
  const parts = [value.address || value.street, value.street2 || value.address2 || '', value.city, value.state, value.zip || value.postal_code, value.country]
  return { complete: [parts[0], parts[2], parts[3], parts[4], parts[5]].every(part => !!normalize(part)), key: parts.map(normalize).join('|') }
}

/** Evidence is supplied by an authenticated provider reader, never by a fuzzy match score. */
export function corroboratePurchaseOrder(po: Document, order: Document) {
  if (!providerId(po.purchaseorder_id) || !providerId(order.salesorder_id)) throw new Error('PO_ORDER_PROVIDER_IDS_REQUIRED')
  if (po.salesorder_id && po.salesorder_id !== order.salesorder_id) throw new Error('PO_ORDER_PROVIDER_CONFLICT')
  if (po.delivery_customer_id && order.customer_id && String(po.delivery_customer_id) !== String(order.customer_id)) throw new Error('PO_ORDER_CUSTOMER_ID_CONFLICT')
  const company = normalize(po.delivery_customer_name || po.customer_name || po.delivery_address?.company_name)
  const orderCompany = normalize(order.customer_name || order.shipping_address?.company_name)
  const delivery = address(po.delivery_address || po.shipping_address)
  const shipping = address(order.shipping_address)
  const reference = String(po.reference_number || '').trim()
  const number = String(order.salesorder_number || '').trim()
  const poLines = Array.isArray(po.line_items) ? po.line_items : []
  const orderLines = Array.isArray(order.line_items) ? order.line_items : []
  const matchedItems = poLines.filter((line: Document) => Number(line.quantity) > 0 && orderLines.some((other: Document) =>
    Number(other.quantity) === Number(line.quantity) && (
      line.item_id && other.item_id ? String(line.item_id) === String(other.item_id) :
      (line.sku && normalize(line.sku) === normalize(other.sku))
    )))
  if (!number || reference !== number || !company || company !== orderCompany || !delivery.complete || !shipping.complete || delivery.key !== shipping.key || !matchedItems.length) {
    throw new Error('PO_ORDER_CORROBORATION_REQUIRED')
  }
  const itemIdentity = (lines: Document[]) => lines.map(line => [String(line.item_id || ''), normalize(line.sku), Number(line.quantity)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const fingerprint = createHash('sha256').update(JSON.stringify({ purchaseOrderId: po.purchaseorder_id, salesOrderId: order.salesorder_id, number, company, address: delivery.key, purchaseItems: itemIdentity(poLines), orderItems: itemIdentity(orderLines) })).digest('hex')
  return { purchaseOrderId: po.purchaseorder_id as string, salesOrderId: order.salesorder_id as string, salesOrderNumber: number, fingerprint, confidence: 'CORROBORATED' as const, matchedItemCount: matchedItems.length }
}

/** Local association only. Provider financial records, ownership and totals are never changed. */
export async function linkCorroboratedPurchaseOrder(input: {
  purchaseOrder: Document; salesOrder: Document; observedAt: string; expectedUpdatedAt: Date;
}) {
  const proof = corroboratePurchaseOrder(input.purchaseOrder, input.salesOrder)
  const observed = Date.parse(input.observedAt)
  if (!Number.isFinite(observed) || observed > Date.now() + 60000 || Date.now() - observed > 2 * 60 * 60 * 1000) throw new Error('PO_ORDER_FRESH_EVIDENCE_REQUIRED')
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`po-order:${proof.purchaseOrderId}`}))`
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { zohoId: proof.purchaseOrderId } })
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { zohoId: proof.salesOrderId } })
    const matches = await tx.salesOrder.findMany({ where: { OR: [
      { items: { path: ['salesorder_number'], equals: proof.salesOrderNumber } },
      { items: { path: ['salesOrderNumber'], equals: proof.salesOrderNumber } },
    ] }, select: { id: true }, take: 2 })
    if (matches.length !== 1 || matches[0].id !== order.id) throw new Error('PO_ORDER_UNIQUE_REFERENCE_REQUIRED')
    if (po.referenceNumber?.trim() !== proof.salesOrderNumber) throw new Error('PO_ORDER_LOCAL_REFERENCE_CHANGED')
    const existing = po.salesOrderLinkEvidence as Document | null
    if (po.salesOrderId === proof.salesOrderId && existing?.fingerprint === proof.fingerprint) return { state: 'ALREADY_LINKED', purchaseOrderId: po.id }
    if (po.salesOrderId || po.invoiceId || existing) throw new Error('PO_ORDER_EXISTING_LINK_REQUIRES_REVIEW')
    if (po.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new Error('PO_ORDER_CHANGED_SINCE_REVIEW')
    const evidence = { source: 'INFERRED', ...proof, verifiedAt: input.observedAt }
    const changed = await tx.purchaseOrder.updateMany({ where: { id: po.id, updatedAt: input.expectedUpdatedAt, salesOrderId: null, invoiceId: null }, data: {
      salesOrderId: proof.salesOrderId, salesOrderNumber: proof.salesOrderNumber, salesOrderLinkEvidence: evidence,
    } })
    if (changed.count !== 1) throw new Error('PO_ORDER_CHANGED_DURING_LINK')
    await tx.operationalEvent.create({ data: { entityType: 'purchaseOrder', entityId: po.id, accountId: order.accountId, eventType: 'PO_ORDER_LINK_CORROBORATED', title: 'Linked purchase order using corroborated provider evidence', source: 'PO_RECONCILIATION', metadata: { evidence, previousSalesOrderId: po.salesOrderId, previousSalesOrderNumber: po.salesOrderNumber, previousUpdatedAt: po.updatedAt.toISOString() } } })
    const verified = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })
    if (verified.salesOrderId !== proof.salesOrderId || (verified.salesOrderLinkEvidence as Document)?.fingerprint !== proof.fingerprint) throw new Error('PO_ORDER_LOCAL_READBACK_MISMATCH')
    return { state: 'LINKED', purchaseOrderId: po.id }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 })
}
