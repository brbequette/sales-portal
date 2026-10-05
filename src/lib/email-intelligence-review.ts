import { prisma } from './prisma'

export async function reviewEmailEvent(input: { id: string; action: string; actorId: string; expectedUpdatedAt: string; accountId?: string; ownerId?: string; dueDate?: string }) {
  if (!['APPROVE', 'REJECT', 'REOPEN', 'CREATE_TASK', 'LINK_ACCOUNT'].includes(input.action)) throw new Error('Invalid review action.')
  return prisma.$transaction(async tx => {
    const event = await tx.emailOperationalEvent.findUnique({ where: { id: input.id }, include: { email: { select: { subject: true, fromAddress: true, mailboxAddress: true } } } })
    if (!event) throw new Error('Email event not found.')
    if (event.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error('This event changed. Refresh before reviewing.')
    if (event.status === 'APPLIED') throw new Error('A follow-up was already created. Manage it from Tasks.')
    if (input.action === 'CREATE_TASK' && event.status !== 'APPROVED') throw new Error('Approve the evidence before creating a follow-up.')
    if (input.action === 'LINK_ACCOUNT') {
      if (!input.accountId || !await tx.account.findUnique({ where: { id: input.accountId }, select: { id: true } })) throw new Error('Choose an existing account.')
      const linked = await tx.emailOperationalEvent.updateMany({ where: { id: event.id, updatedAt: event.updatedAt, status: event.status }, data: {
        accountId: input.accountId, invoiceId: null, salesOrderId: null, purchaseOrderId: null, packageId: null,
        matchMethod: 'MANUAL_REVIEW', matchConfidence: 1, conflictReason: null, status: 'REVIEW_REQUIRED', reviewedById: input.actorId, reviewedAt: null,
        proposedChanges: { action: 'MANUAL_ACCOUNT_LINK', actorId: input.actorId, linkedAt: new Date().toISOString(), previousAccountId: event.accountId, previousInvoiceId: event.invoiceId, previousSalesOrderId: event.salesOrderId, previousPurchaseOrderId: event.purchaseOrderId, previousPackageId: event.packageId, previousConflict: event.conflictReason },
      } })
      if (!linked.count) throw new Error('This event changed. Refresh before reviewing.')
      return { status: 'REVIEW_REQUIRED' }
    }
    const status = input.action === 'CREATE_TASK' ? 'APPLIED' : input.action === 'APPROVE' ? 'APPROVED' : input.action === 'REJECT' ? 'REJECTED' : 'REVIEW_REQUIRED'
    const claimed = await tx.emailOperationalEvent.updateMany({ where: { id: event.id, updatedAt: event.updatedAt, status: event.status }, data: { status, reviewedById: input.actorId, reviewedAt: status === 'REVIEW_REQUIRED' ? null : new Date() } })
    if (!claimed.count) throw new Error('This event changed. Refresh before reviewing.')
    if (input.action !== 'CREATE_TASK') return { status }
    if (!event.accountId || event.conflictReason) throw new Error('Resolve the account match before creating a follow-up.')
    const account = await tx.account.findUnique({ where: { id: event.accountId }, select: { ownerId: true } })
    const ownerId = input.ownerId || account?.ownerId
    if (!ownerId || !await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } })) throw new Error('Choose an existing follow-up owner.')
    const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 86400000)
    if (!Number.isFinite(dueDate.getTime())) throw new Error('Choose a valid due date.')
    const task = await tx.task.upsert({ where: { zohoId: `email_intelligence_${event.id}` }, update: {}, create: {
      zohoId: `email_intelligence_${event.id}`, subject: event.summary.slice(0, 250),
      description: `Review email evidence before acting. No payment, shipment, address or provider record was changed.\n\nFrom: ${event.email.fromAddress}\nSubject: ${event.email.subject}\nMailbox: ${event.email.mailboxAddress || ''}\nEvent: ${event.id}\n\n${JSON.stringify(event.extractedData, null, 2)}`,
      ownerId, dueDate, accountId: event.accountId, invoiceId: event.invoiceId, salesOrderId: event.salesOrderId, type: 'Email', priority: 'High', status: 'Not Started',
    } })
    await tx.emailOperationalEvent.update({ where: { id: event.id }, data: { appliedAt: new Date(), appliedChanges: { action: 'CREATE_FOLLOW_UP_TASK', taskId: task.id, ownerId, dueDate: dueDate.toISOString() } } })
    return { status, taskId: task.id }
  })
}
