import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDbUser } from '@/lib/session-user'
import { convertPersistedCrmLead, isAuthoritativeCrmId, persistPortalLeadToCrm } from '@/lib/zoho-crm-lifecycle'
import { reconcileBooksPrimaryContact } from '@/lib/zoho-books-customer'
import { getZohoAccessToken } from '@/lib/zoho-auth'
import { createHash } from 'node:crypto'

const ZOHO_DC = process.env.ZOHO_DC?.trim() || 'com'
const SUPPORTED_TIME_ZONES = new Set(['EST', 'CST', 'MST', 'PST', 'AST', 'HST'])

async function reconcileProviderProfile(accountId: string, timeZone: string, actor: { id: string; name?: string | null; email?: string | null }) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account?.booksCustomerId || !account.crmAccountId) throw new Error('Authoritative CRM and Books mappings are required.')
  if (!account.billingStreet || !account.billingCity || !account.billingState || !account.billingZip) throw new Error('Complete local billing address is required.')
  const shipping = { street: account.shippingStreet || account.billingStreet, city: account.shippingCity || account.billingCity, state: account.shippingState || account.billingState, zip: account.shippingZip || account.billingZip }
  const desired = { billing: { street: account.billingStreet, city: account.billingCity, state: account.billingState, zip: account.billingZip }, shipping, timeZone }
  const fingerprint = createHash('sha256').update(JSON.stringify(desired)).digest('hex').slice(0, 20)
  const idempotencyKey = `account-provider-profile:${account.id}:${fingerprint}`
  const prior = await prisma.operationalAction.findUnique({ where: { idempotencyKey } })
  if (prior?.status === 'SUCCEEDED') return { state: 'SUCCEEDED', alreadyReconciled: true, ...desired }
  const token = await getZohoAccessToken()
  const booksBase = `https://www.zohoapis.${ZOHO_DC}/books/v3`
  const booksPayload = {
    billing_address: { address: desired.billing.street, city: desired.billing.city, state: desired.billing.state, zip: desired.billing.zip, country: 'US' },
    shipping_address: { address: shipping.street, city: shipping.city, state: shipping.state, zip: shipping.zip, country: 'US' },
  }
  const booksResponse = await fetch(`${booksBase}/contacts/${encodeURIComponent(account.booksCustomerId)}?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID || '')}`, { method: 'PUT', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(booksPayload), signal: AbortSignal.timeout(15000) })
  const booksBody = await booksResponse.json().catch(() => null)
  if (!booksResponse.ok || Number(booksBody?.code) !== 0) throw new Error(String(booksBody?.message || `Books profile update failed (HTTP ${booksResponse.status}).`))

  const crmPayload = { Billing_Street: desired.billing.street, Billing_City: desired.billing.city, Billing_State: desired.billing.state, Billing_Code: desired.billing.zip, Billing_Country: 'US', Shipping_Street: shipping.street, Shipping_City: shipping.city, Shipping_State: shipping.state, Shipping_Code: shipping.zip, Shipping_Country: 'US', Time_Zone: timeZone }
  const crmResponse = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${encodeURIComponent(account.crmAccountId)}`, { method: 'PUT', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [crmPayload] }), signal: AbortSignal.timeout(15000) })
  const crmBody = await crmResponse.json().catch(() => null)
  if (!crmResponse.ok || crmBody?.data?.[0]?.code !== 'SUCCESS') throw new Error(String(crmBody?.data?.[0]?.message || `CRM profile update failed (HTTP ${crmResponse.status}).`))

  const [booksVerifyResponse, crmVerifyResponse] = await Promise.all([
    fetch(`${booksBase}/contacts/${encodeURIComponent(account.booksCustomerId)}?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID || '')}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) }),
    fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${encodeURIComponent(account.crmAccountId)}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) }),
  ])
  const booksVerify = await booksVerifyResponse.json().catch(() => null)
  const crmVerify = await crmVerifyResponse.json().catch(() => null)
  const booksContact = booksVerify?.contact
  const crmAccount = crmVerify?.data?.[0]
  const booksBillingStreet = String(booksContact?.billing_address?.address || booksContact?.billing_address?.street || '').trim()
  const booksShippingStreet = String(booksContact?.shipping_address?.address || booksContact?.shipping_address?.street || '').trim()
  if (!booksVerifyResponse.ok || booksBillingStreet !== desired.billing.street || booksShippingStreet !== shipping.street) throw new Error('Books address verification did not match the requested Street1 values.')
  if (!crmVerifyResponse.ok || String(crmAccount?.Shipping_Street || '').trim() !== shipping.street || String(crmAccount?.Time_Zone || '').trim() !== timeZone) throw new Error('CRM shipping address/timezone verification did not match the requested values.')

  await prisma.$transaction([
    prisma.account.update({ where: { id: account.id }, data: { shippingStreet: shipping.street, shippingCity: shipping.city, shippingState: shipping.state, shippingZip: shipping.zip, timeZone } }),
    prisma.operationalAction.upsert({ where: { idempotencyKey }, update: { status: 'SUCCEEDED', result: { booksBillingStreet, booksShippingStreet, crmShippingStreet: crmAccount.Shipping_Street, crmTimeZone: crmAccount.Time_Zone }, completedAt: new Date() }, create: { idempotencyKey, actionType: 'RECONCILE_PROVIDER_ACCOUNT_PROFILE', entityType: 'ACCOUNT', entityId: account.id, accountId: account.id, status: 'SUCCEEDED', payload: desired, result: { booksBillingStreet, booksShippingStreet, crmShippingStreet: crmAccount.Shipping_Street, crmTimeZone: crmAccount.Time_Zone }, attemptCount: 1, maxAttempts: 1, startedAt: new Date(), completedAt: new Date(), actorId: actor.id, actorName: actor.name || actor.email } }),
  ])
  return { state: 'SUCCEEDED', alreadyReconciled: false, ...desired }
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  const { accountId, leadId, repairProfile = false, timeZone = 'CST' } = await request.json().catch(() => ({}))
  if (!accountId || !leadId) return NextResponse.json({ error: 'accountId and leadId are required' }, { status: 400 })
  if (repairProfile && !SUPPORTED_TIME_ZONES.has(String(timeZone))) return NextResponse.json({ error: 'Unsupported account time zone.' }, { status: 400 })
  const [account, lead] = await Promise.all([
    prisma.account.findUnique({ where: { id: String(accountId) }, select: { id: true, crmAccountId: true, booksCustomerId: true, contacts: { where: { isPrimary: true }, take: 1, select: { crmContactId: true } } } }),
    prisma.lead.findUnique({ where: { id: String(leadId) }, select: { id: true, convertedAccountId: true, crmLeadId: true } }),
  ])
  if (!account || !lead) return NextResponse.json({ error: 'Account or lead not found' }, { status: 404 })
  if (lead.convertedAccountId !== account.id) return NextResponse.json({ error: 'The lead is not linked to the specified local account.' }, { status: 409 })

  const leadResult = isAuthoritativeCrmId(lead.crmLeadId)
    ? { state: 'SUCCEEDED' as const, crmLeadId: lead.crmLeadId }
    : await persistPortalLeadToCrm(lead.id)
  if (leadResult.state !== 'SUCCEEDED') {
    return NextResponse.json({ success: false, stage: 'CRM_LEAD', providerState: leadResult.state, code: leadResult.code || null, message: leadResult.message || null }, { status: 202 })
  }
  const crmResult = isAuthoritativeCrmId(account.crmAccountId) && isAuthoritativeCrmId(account.contacts[0]?.crmContactId)
    ? { state: 'SUCCEEDED' as const, crmAccountId: account.crmAccountId, crmContactId: account.contacts[0].crmContactId }
    : await convertPersistedCrmLead(lead.id, account.id)
  if (crmResult.state !== 'SUCCEEDED') {
    return NextResponse.json({ success: false, stage: 'CRM_CONVERSION', providerState: crmResult.state, code: crmResult.code || null, message: crmResult.message || null }, { status: 202 })
  }
  const booksResult = account.booksCustomerId
    ? await reconcileBooksPrimaryContact(account.id)
    : { state: 'FAILED' as const, message: 'Existing Books customer mapping is required; this reconciliation path never creates one.' }
  const profileResult = booksResult.state === 'SUCCEEDED' && repairProfile ? await reconcileProviderProfile(account.id, String(timeZone), actor.user) : null

  return NextResponse.json({
    success: booksResult.state === 'SUCCEEDED',
    crm: {
      state: crmResult.state,
      leadMapped: isAuthoritativeCrmId(leadResult.crmLeadId),
      accountMapped: isAuthoritativeCrmId(crmResult.crmAccountId),
      contactMapped: isAuthoritativeCrmId(crmResult.crmContactId),
    },
    books: { state: booksResult.state, customerMapped: Boolean(account.booksCustomerId), contactMapped: Boolean(booksResult.booksContactId), message: booksResult.message || null },
    profile: profileResult,
  }, { status: booksResult.state === 'SUCCEEDED' ? 200 : 202 })
}
