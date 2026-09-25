/** Invoice evidence owns the post-sale lifecycle; missing evidence never means complete. */
export type InvoiceEvidence = {
  status: string; amount: number; balance: number | null; paymentMade: number | null;
  dueDate: Date | string | null; isWrittenOff: boolean; syncConflict?: boolean;
}
export function dispositionInvoice(invoice: InvoiceEvidence, now = new Date()) {
  const status = invoice.status.trim().toLowerCase().replace(/[ _-]+/g, '')
  if (status === 'orphaned' || invoice.syncConflict) return 'Needs Review'
  if (invoice.isWrittenOff || status === 'writtenoff' || status === 'writeoff') return 'Written Off'
  if (['void', 'voided', 'cancelled', 'canceled'].includes(status)) return 'Voided'
  if (status === 'draft') return 'Draft Invoice'
  if (['refunded', 'credited'].includes(status)) return 'Credited / Refunded'
  if (invoice.balance !== null && (!Number.isFinite(invoice.balance) || invoice.balance < 0)) return 'Needs Review'
  if (status === 'paid' && invoice.balance !== null && invoice.balance > 0.005) return 'Needs Review'
  if (status === 'paid') return 'Paid'
  // A zero balance may be a credit/write-off, and does not prove a cash payment.
  if (invoice.balance === 0) return 'Settled — Review Payment'
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const localToday = ['year','month','day'].map(type => parts.find(part => part.type === type)!.value).join('-')
  if (invoice.balance !== null && invoice.balance > 0 && invoice.dueDate && new Date(invoice.dueDate).toISOString().slice(0, 10) < localToday) return 'Overdue'
  if (status === 'overdue') return 'Overdue'
  if ((invoice.paymentMade ?? 0) > 0 || status === 'partiallypaid') return 'Partially Paid'
  if (['sent', 'unpaid', 'open', 'viewed'].includes(status)) return 'Invoiced'
  return 'Needs Review'
}

export function dispositionDeal(invoices: InvoiceEvidence[], now = new Date()) {
  if (!invoices.length) return null // Preserve pre-sale opportunities.
  const stages = invoices.map(i => dispositionInvoice(i, now))
  if (stages.every(s => s === 'Voided')) return 'Voided'
  const active = stages.filter(s => s !== 'Voided')
  for (const stage of ['Needs Review', 'Written Off', 'Credited / Refunded', 'Settled — Review Payment', 'Overdue', 'Draft Invoice'] as const) {
    if (active.includes(stage)) return stage
  }
  if (active.every(s => s === 'Paid')) return 'Paid'
  if (active.includes('Partially Paid') || active.includes('Paid')) return 'Partially Paid'
  return 'Invoiced'
}

export function exactDocumentReference(name: string, number: string) {
  const parts = name.split('|')
  return !!number.trim() && parts.length > 1 && parts.at(-1)!.trim().toLowerCase() === number.trim().toLowerCase()
}
export function isCrmId(value: unknown): value is string { return typeof value === 'string' && /^\d{15,20}$/.test(value) }

/** A provider customer ID must match an explicit Books identity, never a name. */
export function booksCustomerConflicts(customerId: unknown, account: { booksCustomerId?: string | null; zohoId?: string | null }) {
  if (customerId === undefined || customerId === null || customerId === '') return false
  return typeof customerId !== 'string' || ![account.booksCustomerId, account.zohoId].includes(customerId)
}

export function verifiedCompletion(
  invoices: Array<InvoiceEvidence & { id: string; zohoId: string; salesOrderZohoId: string | null }>,
  packages: Array<{ id: string; salesOrderId: string | null; status: string | null }>,
  checklists: Array<{ documentId: string; completedAt: unknown; paymentVerified: boolean; giftSent: boolean; satisfactionChecked: boolean; evidence: unknown }>,
) {
  if (dispositionDeal(invoices) !== 'Paid') return false
  return invoices.filter(i => !['void', 'voided'].includes(i.status.toLowerCase())).every(invoice => {
    const checklist = checklists.find(c => c.documentId === invoice.id || c.documentId === invoice.zohoId)
    const evidence = checklist?.evidence as Record<string, any> | null
    const deliveries = packages.filter(p => p.salesOrderId === invoice.salesOrderZohoId)
    return !!invoice.salesOrderZohoId && deliveries.length > 0 && deliveries.every(p => p.status?.toLowerCase() === 'delivered')
      && !!checklist?.completedAt && checklist.paymentVerified && checklist.giftSent && checklist.satisfactionChecked
      && ['paymentVerified', 'giftSent', 'satisfactionChecked'].every(key => evidence?.[key]?.verified === true)
      && Array.isArray(evidence?.giftSent?.packageIds) && evidence.giftSent.packageIds.length > 0
      && evidence.giftSent.packageIds.every((id: string) => deliveries.some(p => p.id === id))
  })
}
