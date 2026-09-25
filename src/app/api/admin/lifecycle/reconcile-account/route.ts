import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDbUser } from '@/lib/session-user'
import { convertPersistedCrmLead, persistPortalLeadToCrm } from '@/lib/zoho-crm-lifecycle'
import { reconcileBooksPrimaryContact } from '@/lib/zoho-books-customer'

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  const { accountId, leadId } = await request.json().catch(() => ({}))
  if (!accountId || !leadId) return NextResponse.json({ error: 'accountId and leadId are required' }, { status: 400 })
  const [account, lead] = await Promise.all([
    prisma.account.findUnique({ where: { id: String(accountId) }, select: { id: true, crmAccountId: true, booksCustomerId: true, contacts: { where: { isPrimary: true }, take: 1, select: { crmContactId: true } } } }),
    prisma.lead.findUnique({ where: { id: String(leadId) }, select: { id: true, convertedAccountId: true, crmLeadId: true } }),
  ])
  if (!account || !lead) return NextResponse.json({ error: 'Account or lead not found' }, { status: 404 })
  if (lead.convertedAccountId !== account.id) return NextResponse.json({ error: 'The lead is not linked to the specified local account.' }, { status: 409 })

  const leadResult = lead.crmLeadId ? { state: 'SUCCEEDED' as const, crmLeadId: lead.crmLeadId } : await persistPortalLeadToCrm(lead.id)
  if (leadResult.state !== 'SUCCEEDED') {
    return NextResponse.json({ success: false, stage: 'CRM_LEAD', providerState: leadResult.state, code: leadResult.code || null, message: leadResult.message || null }, { status: 202 })
  }
  const crmResult = account.crmAccountId && account.contacts[0]?.crmContactId
    ? { state: 'SUCCEEDED' as const, crmAccountId: account.crmAccountId, crmContactId: account.contacts[0].crmContactId }
    : await convertPersistedCrmLead(lead.id, account.id)
  if (crmResult.state !== 'SUCCEEDED') {
    return NextResponse.json({ success: false, stage: 'CRM_CONVERSION', providerState: crmResult.state, code: crmResult.code || null, message: crmResult.message || null }, { status: 202 })
  }
  const booksResult = account.booksCustomerId
    ? await reconcileBooksPrimaryContact(account.id)
    : { state: 'FAILED' as const, message: 'Existing Books customer mapping is required; this reconciliation path never creates one.' }

  return NextResponse.json({
    success: booksResult.state === 'SUCCEEDED',
    crm: { state: crmResult.state, leadMapped: true, accountMapped: true, contactMapped: Boolean(crmResult.crmContactId) },
    books: { state: booksResult.state, customerMapped: Boolean(account.booksCustomerId), contactMapped: Boolean(booksResult.booksContactId), message: booksResult.message || null },
  }, { status: booksResult.state === 'SUCCEEDED' ? 200 : 202 })
}
