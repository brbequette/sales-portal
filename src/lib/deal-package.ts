import { prisma } from './prisma'
import { dispositionDeal, verifiedCompletion, booksCustomerConflicts } from './deal-lifecycle'

export const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}

/** Read-through package: financial documents remain authoritative, never copied back from CRM. */
export async function getDealPackage(dealId: string) {
  return prisma.$transaction(async tx => {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    include: {
      owner: { select: { id: true, name: true, zohoId: true } },
      account: { include: { contacts: true } },
      invoices: { include: { payments: true, lineItems: true, financialReviews: true }, orderBy: { issueDate: 'asc' } },
      quotes: { include: { lineItems: true } }, salesOrders: { include: { lineItems: true } },
      tasks: true,
    },
  })
  if (!deal) throw new Error('DEAL_NOT_FOUND')
  const invoiceIds = deal.invoices.flatMap(i => [i.id, i.zohoId])
  const orderIds = deal.salesOrders.flatMap(i => [i.id, i.zohoId]).filter((id): id is string => !!id)
  const documentIds = [...invoiceIds, ...orderIds, ...deal.quotes.flatMap(q => [q.id, q.zohoId]).filter((id): id is string => !!id), deal.id]
  const [purchaseOrders, packages, events, notes, calls, messages, checklists, jobs] = await Promise.all([
    tx.purchaseOrder.findMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { salesOrderId: { in: orderIds } }] }, orderBy: { id: 'asc' } }),
    tx.package.findMany({ where: { salesOrderId: { in: orderIds } }, orderBy: { id: 'asc' } }),
    tx.operationalEvent.findMany({ where: { entityId: { in: documentIds } }, orderBy: { occurredAt: 'asc' } }),
    tx.note.findMany({ where: { accountId: deal.accountId }, orderBy: { id: 'asc' } }),
    tx.callLog.findMany({ where: { accountId: deal.accountId }, orderBy: { id: 'asc' } }),
    tx.smsMessage.findMany({ where: { accountId: deal.accountId }, orderBy: { id: 'asc' } }),
    tx.salesClosingChecklist.findMany({ where: { documentId: { in: documentIds } }, orderBy: { documentId: 'asc' } }),
    tx.$queryRaw<Array<{ checkedAt: Date | null; changedAt: Date; lastError: string | null }>>`SELECT j."checkedAt", j."changedAt", j."lastError" FROM "DealSyncJob" j JOIN "Invoice" i ON i.id=j."invoiceId" WHERE i."dealId"=${dealId}`,
  ])
  const rawData = object(deal.rawData)
  const { _portalSync, _portalCrmNotes, ...crmFields } = rawData
  const identityConflict = deal.invoices.some(i => i.accountId !== deal.accountId || booksCustomerConflicts(object(i.items).customer_id, deal.account))
  const complete = !identityConflict && verifiedCompletion(deal.invoices, packages, checklists)
  const lifecycle = identityConflict ? 'Needs Review' : complete ? 'Complete' : dispositionDeal(deal.invoices) || deal.stage
  const activeInvoices = deal.invoices.filter(i => !['void','voided','orphaned'].includes(i.status.toLowerCase()))
  const unknowns: string[] = []
  if (identityConflict) unknowns.push('Books customer identity conflicts with this deal account; reconciliation is required.')
  if (deal.invoices.some(i => i.balance === null)) unknowns.push('One or more invoice balances are unknown.')
  if (deal.invoices.some(i => i.computedProfit === null)) unknowns.push('One or more invoice profit calculations are unavailable.')
  if (!packages.length) unknowns.push('No linked package evidence; fulfillment is unverified.')
  if (deal.invoices.some(i => i.financialReviews.some(r => r.status === 'OPEN'))) unknowns.push('Financial review exceptions remain open.')
  // All actual completion facts remain visible in source items/checklists. No paid => shipped inference.
  return {
    version: 1,
    deal: { id: deal.id, crmId: /^\d+$/.test(deal.zohoId) ? deal.zohoId : null, name: deal.name, owner: deal.owner, stage: lifecycle, closingDate: deal.closingDate, crmFields },
    account: deal.account,
    invoices: deal.invoices, quotes: deal.quotes, salesOrders: deal.salesOrders,
    purchaseOrders, packages, tasks: deal.tasks, history: events, checklists, crmNotes: _portalCrmNotes || [],
    accountContext: { scope: 'Account-wide context; not proof that each activity concerns this deal.', notes, calls, messages },
    financials: {
      invoiceAmount: activeInvoices.reduce((sum, i) => sum + i.amount, 0),
      balance: activeInvoices.every(i => i.balance !== null) ? activeInvoices.reduce((sum, i) => sum + i.balance!, 0) : null,
      profit: activeInvoices.every(i => i.computedProfit !== null) ? activeInvoices.reduce((sum, i) => sum + i.computedProfit!, 0) : null,
    },
    lifecycle: { disposition: lifecycle, fulfillment: packages.length ? 'See individual package statuses' : 'Unknown', completion: complete ? 'Verified by linked deliveries and closing evidence' : 'Requires verified fulfillment, gift release and closing checklist' },
    unknowns,
    sync: { ..._portalSync, state: jobs.some(j => j.lastError) ? 'REVIEW_REQUIRED' : jobs.some(j => !j.checkedAt || j.changedAt > j.checkedAt) ? 'PENDING' : _portalSync?.state || 'NOT_SYNCED' },
  }
  }, { isolationLevel: 'RepeatableRead', timeout: 60000 })
}
