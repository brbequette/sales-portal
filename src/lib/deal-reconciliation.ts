import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { dispositionDeal, exactDocumentReference, verifiedCompletion, isCrmId, booksCustomerConflicts } from './deal-lifecycle'
import { object } from './deal-package'

/** Guard existing associations; legacy name references qualify only within the exact Account. */
export async function reconcileInvoiceDeal(invoiceId: string) {
  return prisma.$transaction(async tx => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { account: true, deal: true } })
    if (!invoice) throw new Error('INVOICE_NOT_FOUND')
    if (booksCustomerConflicts(object(invoice.items).customer_id, invoice.account)) throw new Error('BOOKS_CUSTOMER_ID_MISMATCH')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`deal-account:${invoice.accountId}`}))`
    let deal = invoice.deal
    // Books owns the document-to-opportunity identity. Never fall back to names
    // when it supplies an explicit ID, even if that CRM record is not imported yet.
    const potential = object(invoice.items).zcrm_potential_id ?? object(invoice.rawData).zcrm_potential_id
    if (potential) {
      if (!isCrmId(potential)) throw new Error('INVALID_BOOKS_CRM_POTENTIAL_ID')
      const authoritative = await tx.deal.findUnique({ where: { zohoId: potential } })
      if (!authoritative) throw new Error('BOOKS_CRM_POTENTIAL_NOT_IMPORTED')
      if (authoritative.accountId !== invoice.accountId) throw new Error('BOOKS_CRM_POTENTIAL_ACCOUNT_CONFLICT')
      if (deal?.id !== authoritative.id) {
        const linked = await tx.invoice.updateMany({ where: { id: invoice.id, dealId: invoice.dealId, updatedAt: invoice.updatedAt }, data: { dealId: authoritative.id } })
        if (linked.count !== 1) throw new Error('INVOICE_CHANGED_DURING_RECONCILIATION')
        await tx.operationalEvent.create({ data: { entityType: 'invoice', entityId: invoice.id, accountId: invoice.accountId, eventType: 'BOOKS_POTENTIAL_LINK_RECONCILED', title: 'Linked invoice to Books CRM potential', source: 'INVOICE_RECONCILIATION', metadata: { previousDealId: invoice.dealId, dealId: authoritative.id, zcrm_potential_id: potential } } })
      }
      deal = authoritative
    }
    if (deal && deal.accountId !== invoice.accountId) throw new Error('CROSS_ACCOUNT_DEAL_LINK')
    const number = invoice.invoiceNumber || invoice.computedInvoiceNumber || object(invoice.items).invoice_number || ''
    if (!deal) {
      const candidates = await tx.deal.findMany({ where: { accountId: invoice.accountId } })
      const order = invoice.salesOrderZohoId ? await tx.salesOrder.findUnique({ where: { zohoId: invoice.salesOrderZohoId } }) : null
      const quote = invoice.estimateZohoId ? await tx.quote.findUnique({ where: { zohoId: invoice.estimateZohoId } }) : null
      if ([order, quote].some(d => d && d.accountId !== invoice.accountId)) throw new Error('CROSS_ACCOUNT_DOCUMENT_LINEAGE')
      const lineageIds = [order?.dealId, quote?.dealId].filter(Boolean)
      const exact = candidates.filter(d => lineageIds.includes(d.id) || d.zohoId === `invoice:${invoice.zohoId}` || object(d.rawData)._portalSync?.originInvoiceId === invoice.zohoId || exactDocumentReference(d.name, number))
      if (exact.length > 1) throw new Error('AMBIGUOUS_DEAL_MATCH')
      deal = exact[0] || null
      if (!deal) {
        const salesperson = invoice.computedSalesperson || object(invoice.items).salesperson_name
        const owners = salesperson ? await tx.user.findMany({ where: { name: { equals: salesperson, mode: 'insensitive' } }, select: { id: true } }) : []
        // Account owner is an explicit provisional assignment, never presented as verified invoice ownership.
        deal = await tx.deal.create({ data: {
          zohoId: `invoice:${invoice.zohoId}`, accountId: invoice.accountId,
          ownerId: owners.length === 1 ? owners[0].id : invoice.account.ownerId,
          name: `${invoice.account.name} | ${number || invoice.zohoId}`,
          amount: invoice.amount, stage: 'Needs Review', closingDate: invoice.issueDate,
          rawData: { _portalSync: { originInvoiceId: invoice.zohoId, ownerEvidence: owners.length === 1 ? 'EXACT_INVOICE_SALESPERSON' : 'PROVISIONAL_ACCOUNT_OWNER', state: 'PENDING' } },
        } })
      }
      const linked = await tx.invoice.updateMany({ where: { id: invoice.id, dealId: null, updatedAt: invoice.updatedAt }, data: { dealId: deal.id } })
      if (linked.count !== 1) throw new Error('INVOICE_CHANGED_DURING_RECONCILIATION')
    }
    // Never infer lineage from amount, customer name, or a nearby date.
    for (const [kind, providerId] of [['salesOrder', invoice.salesOrderZohoId], ['quote', invoice.estimateZohoId]] as const) {
      if (!providerId) continue
      const document = kind === 'salesOrder' ? await tx.salesOrder.findUnique({ where: { zohoId: providerId } }) : await tx.quote.findUnique({ where: { zohoId: providerId } })
      if (!document) continue
      if (document.accountId !== invoice.accountId || (document.dealId && document.dealId !== deal.id)) throw new Error('CONFLICTING_DOCUMENT_LINEAGE')
      if (!document.dealId && kind === 'salesOrder') await tx.salesOrder.update({ where: { id: document.id }, data: { dealId: deal.id } })
      else if (!document.dealId) await tx.quote.update({ where: { id: document.id }, data: { dealId: deal.id } })
    }
    const invoices = await tx.invoice.findMany({ where: { dealId: deal.id } })
    if (invoices.some(i => i.accountId !== deal!.accountId)) throw new Error('CROSS_ACCOUNT_DEAL_LINK')
    if (invoices.some(i => booksCustomerConflicts(object(i.items).customer_id, invoice.account))) throw new Error('BOOKS_CUSTOMER_ID_MISMATCH')
    const packages = await tx.package.findMany({ where: { salesOrderId: { in: invoices.map(i => i.salesOrderZohoId).filter((id): id is string => !!id) } } })
    const checklists = await tx.salesClosingChecklist.findMany({ where: { documentId: { in: invoices.flatMap(i => [i.id, i.zohoId]) } } })
    const stage = verifiedCompletion(invoices, packages, checklists) ? 'Complete' : dispositionDeal(invoices)!
    const amount = invoices.filter(i => !['void', 'voided', 'orphaned'].includes(i.status.toLowerCase())).reduce((sum, i) => sum + i.amount, 0)
    const previousRaw = object(deal.rawData)
    if (deal.stage !== stage || deal.amount !== amount || !previousRaw._portalSync?.invoiceManaged) {
      await tx.deal.update({ where: { id: deal.id }, data: { stage, amount, rawData: { ...previousRaw, _portalSync: { ...previousRaw._portalSync, invoiceManaged: true } } } })
      if (deal.stage !== stage) await tx.operationalEvent.create({ data: { entityType: 'deal', entityId: deal.id, accountId: deal.accountId, eventType: 'DEAL_DISPOSITION_CHANGED', title: `${deal.stage} → ${stage}`, source: 'INVOICE_RECONCILIATION', metadata: { invoiceIds: invoices.map(i => i.id) } } })
    }
    return deal.id
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 })
}
