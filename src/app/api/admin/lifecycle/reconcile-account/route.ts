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
  const booksCustomerId = account.booksCustomerId
  const crmAccountId = account.crmAccountId
  const booksPayload = {
    billing_address: { address: desired.billing.street, city: desired.billing.city, state: desired.billing.state, zip: desired.billing.zip, country: 'US' },
    shipping_address: { address: shipping.street, city: shipping.city, state: shipping.state, zip: shipping.zip, country: 'US' },
  }
  const crmPayload = { Billing_Street: desired.billing.street, Billing_City: desired.billing.city, Billing_State: desired.billing.state, Billing_Code: desired.billing.zip, Billing_Country: 'US', Shipping_Street: shipping.street, Shipping_City: shipping.city, Shipping_State: shipping.state, Shipping_Code: shipping.zip, Shipping_Country: 'US', Customer_Time_Zone: timeZone }
  const verify = async () => {
    const [booksVerifyResponse, crmVerifyResponse] = await Promise.all([
    fetch(`${booksBase}/contacts/${encodeURIComponent(booksCustomerId)}?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID || '')}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) }),
    fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${encodeURIComponent(crmAccountId)}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(15000) }),
    ])
    const booksVerify = await booksVerifyResponse.json().catch(() => null)
    const crmVerify = await crmVerifyResponse.json().catch(() => null)
    const booksContact = booksVerify?.contact
    const crmAccount = crmVerify?.data?.[0]
    const booksBillingStreet = String(booksContact?.billing_address?.address || booksContact?.billing_address?.street || '').trim()
    const booksShippingStreet = String(booksContact?.shipping_address?.address || booksContact?.shipping_address?.street || '').trim()
    return {
      booksMatches: booksVerifyResponse.ok && Number(booksVerify?.code) === 0 && booksBillingStreet === desired.billing.street && booksShippingStreet === shipping.street,
      crmMatches: crmVerifyResponse.ok && String(crmAccount?.Shipping_Street || '').trim() === shipping.street && String(crmAccount?.Customer_Time_Zone || '').trim() === timeZone,
      booksBillingStreet, booksShippingStreet, crmAccount,
    }
  }

  let evidence = await verify()
  if (!evidence.booksMatches || !evidence.crmMatches) {
    if (prior?.status === 'RUNNING' || prior?.status === 'AMBIGUOUS') {
      return { state: 'AMBIGUOUS', stage: 'PREFLIGHT', message: 'A prior provider write has an unknown outcome and verification is incomplete; it was not resubmitted.' }
    }
    await prisma.operationalAction.upsert({
      where: { idempotencyKey },
      update: { status: 'RUNNING', payload: desired, errorCode: null, errorMessage: null, attemptCount: { increment: 1 }, startedAt: new Date(), completedAt: null },
      create: { idempotencyKey, actionType: 'RECONCILE_PROVIDER_ACCOUNT_PROFILE', entityType: 'ACCOUNT', entityId: account.id, accountId: account.id, status: 'RUNNING', payload: desired, attemptCount: 1, maxAttempts: 1, startedAt: new Date(), actorId: actor.id, actorName: actor.name || actor.email },
    })
    try {
      if (!evidence.booksMatches) {
        const response = await fetch(`${booksBase}/contacts/${encodeURIComponent(booksCustomerId)}?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID || '')}`, { method: 'PUT', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(booksPayload), signal: AbortSignal.timeout(15000) })
        const body = await response.json().catch(() => null)
        if (!response.ok || Number(body?.code) !== 0) throw new Error(`BOOKS_UPDATE: ${String(body?.message || `HTTP ${response.status}`)}`)
      }
      if (!evidence.crmMatches) {
        const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${encodeURIComponent(crmAccountId)}`, { method: 'PUT', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [crmPayload] }), signal: AbortSignal.timeout(15000) })
        const body = await response.json().catch(() => null)
        if (!response.ok || body?.data?.[0]?.code !== 'SUCCESS') throw new Error(`CRM_UPDATE: ${String(body?.data?.[0]?.message || `HTTP ${response.status}`)}`)
      }
      evidence = await verify()
      if (!evidence.booksMatches) throw new Error('BOOKS_VERIFY: Address verification did not match the requested Street1 values.')
      if (!evidence.crmMatches) throw new Error('CRM_VERIFY: Shipping address/timezone verification did not match the requested values.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider profile error'
      const stage = message.includes(':') ? message.split(':', 1)[0] : 'PROVIDER_WRITE'
      const ambiguous = error instanceof DOMException && error.name === 'TimeoutError'
      await prisma.operationalAction.update({ where: { idempotencyKey }, data: { status: ambiguous ? 'AMBIGUOUS' : 'FAILED', errorCode: stage, errorMessage: message, completedAt: new Date() } })
      return { state: ambiguous ? 'AMBIGUOUS' : 'FAILED', stage, message }
    }
  }

  await prisma.$transaction([
    prisma.account.update({ where: { id: account.id }, data: { shippingStreet: shipping.street, shippingCity: shipping.city, shippingState: shipping.state, shippingZip: shipping.zip, timeZone } }),
    prisma.operationalAction.upsert({ where: { idempotencyKey }, update: { status: 'SUCCEEDED', result: { booksBillingStreet: evidence.booksBillingStreet, booksShippingStreet: evidence.booksShippingStreet, crmShippingStreet: evidence.crmAccount?.Shipping_Street, crmTimeZone: evidence.crmAccount?.Customer_Time_Zone }, errorCode: null, errorMessage: null, completedAt: new Date() }, create: { idempotencyKey, actionType: 'RECONCILE_PROVIDER_ACCOUNT_PROFILE', entityType: 'ACCOUNT', entityId: account.id, accountId: account.id, status: 'SUCCEEDED', payload: desired, result: { booksBillingStreet: evidence.booksBillingStreet, booksShippingStreet: evidence.booksShippingStreet, crmShippingStreet: evidence.crmAccount?.Shipping_Street, crmTimeZone: evidence.crmAccount?.Customer_Time_Zone }, attemptCount: 1, maxAttempts: 1, startedAt: new Date(), completedAt: new Date(), actorId: actor.id, actorName: actor.name || actor.email } }),
  ])
  return { state: 'SUCCEEDED', alreadyReconciled: false, ...desired }
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  try {
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
  const profileResult = repairProfile ? await reconcileProviderProfile(account.id, String(timeZone), actor.user) : null

  return NextResponse.json({
    success: booksResult.state === 'SUCCEEDED' && (!profileResult || profileResult.state === 'SUCCEEDED'),
    crm: {
      state: crmResult.state,
      leadMapped: isAuthoritativeCrmId(leadResult.crmLeadId),
      accountMapped: isAuthoritativeCrmId(crmResult.crmAccountId),
      contactMapped: isAuthoritativeCrmId(crmResult.crmContactId),
    },
    books: { state: booksResult.state, customerMapped: Boolean(account.booksCustomerId), contactMapped: Boolean(booksResult.booksContactId), message: booksResult.message || null },
    profile: profileResult,
  }, { status: booksResult.state === 'SUCCEEDED' && (!profileResult || profileResult.state === 'SUCCEEDED') ? 200 : 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lifecycle reconciliation error'
    console.error('Lifecycle reconciliation failed:', message)
    return NextResponse.json({ success: false, stage: 'UNHANDLED', providerState: 'FAILED', message }, { status: 500 })
  }
}
