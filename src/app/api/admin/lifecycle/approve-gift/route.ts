import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDbUser } from '@/lib/session-user'
import { getZohoAccessToken } from '@/lib/zoho-auth'

const ZOHO_DC = process.env.ZOHO_DC?.trim() || 'com'
const BOOKS_TIMEOUT_MS = 15000

type GiftProduct = NonNullable<Awaited<ReturnType<typeof prisma.product.findUnique>>>

async function resolveExactGiftProduct(booksItemId: string): Promise<GiftProduct | null> {
  const mapped = await prisma.product.findUnique({ where: { booksItemId } })
  if (mapped) return mapped

  const organizationId = process.env.ZOHO_ORGANIZATION_ID?.trim()
  if (!organizationId) throw new Error('ZOHO_ORGANIZATION_ID is not configured')
  const token = await getZohoAccessToken()
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items/${encodeURIComponent(booksItemId)}?organization_id=${encodeURIComponent(organizationId)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(BOOKS_TIMEOUT_MS),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || Number(body?.code) !== 0) throw new Error(String(body?.message || `Zoho Books item lookup failed (HTTP ${response.status}).`))

  const item = body?.item
  const returnedId = String(item?.item_id || '').trim()
  const sku = String(item?.sku || '').trim()
  const name = String(item?.name || '').trim()
  const rate = Number(item?.rate)
  const cost = Number(item?.purchase_rate)
  if (returnedId !== booksItemId || !sku || !name || String(item?.status || '').toLowerCase() !== 'active') {
    throw new Error('Books returned an inactive or different gift item identity.')
  }
  if (rate !== 0 || !Number.isFinite(cost) || cost <= 0) {
    throw new Error('Gift must retain a zero sales rate and an authoritative positive Books purchase cost.')
  }

  const candidates = await prisma.product.findMany({
    where: { OR: [{ sku }, { name: { equals: name, mode: 'insensitive' } }] },
    take: 3,
  })
  if (candidates.length > 1) throw new Error('Multiple local products match the exact Books gift identity; no mapping was changed.')
  if (candidates[0]?.booksItemId && candidates[0].booksItemId !== booksItemId) {
    throw new Error('The matching local gift is already mapped to a different Books item.')
  }

  const authoritative = {
    booksItemId,
    name,
    price: 0,
    giftItem: true,
    unitCost: cost,
    costQuality: 'AUTHORITATIVE',
    source: 'ZOHO_BOOKS',
  } as const
  if (candidates[0]) return prisma.product.update({ where: { id: candidates[0].id }, data: authoritative })
  return prisma.product.create({
    data: {
      ...authoritative,
      sku,
      description: String(item?.description || 'Zoho Books gift item'),
      category: 'Gifts',
      subjectToVig: false,
      showOnWeb: false,
      stock: 0,
    },
  })
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  const { booksItemId, reason } = await request.json().catch(() => ({}))
  const itemId = String(booksItemId || '').trim()
  const auditReason = String(reason || '').trim()
  if (!itemId || !auditReason) return NextResponse.json({ error: 'booksItemId and reason are required' }, { status: 400 })

  let product
  try {
    product = await resolveExactGiftProduct(itemId)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Exact Books gift lookup failed' }, { status: 502 })
  }
  if (!product) return NextResponse.json({ error: 'Exact Books product mapping not found' }, { status: 404 })
  if (!product.giftItem) return NextResponse.json({ error: 'Product must be marked as a Gift Item first' }, { status: 409 })
  const cost = Number(product.unitCost)
  if (!(cost > 0) && product.costQuality !== 'VERIFIED_ZERO') return NextResponse.json({ error: 'Gift has no authoritative cost and cannot receive an override' }, { status: 409 })

  const idempotencyKey = `gift-profit-override:${product.id}`
  const existing = await prisma.operationalAction.findUnique({ where: { idempotencyKey } })
  if (existing?.status === 'SUCCEEDED') return NextResponse.json({ success: true, alreadyApproved: true, productId: product.id, booksItemId: itemId })
  const currentAttributes = product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes) ? product.attributes as Record<string, unknown> : {}
  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { attributes: { ...currentAttributes, giftProfitOverride: true, giftProfitOverrideReason: auditReason, giftProfitOverrideAt: new Date().toISOString(), giftProfitOverrideBy: actor.user.id } } }),
    prisma.operationalAction.upsert({
      where: { idempotencyKey },
      update: { status: 'SUCCEEDED', result: { booksItemId: itemId, cost, reason: auditReason }, completedAt: new Date(), actorId: actor.user.id, actorName: actor.user.name || actor.user.email },
      create: { idempotencyKey, actionType: 'APPROVE_GIFT_PROFIT_OVERRIDE', entityType: 'PRODUCT', entityId: product.id, entityNumber: product.sku, status: 'SUCCEEDED', payload: { booksItemId: itemId, reason: auditReason }, result: { cost }, attemptCount: 1, maxAttempts: 1, startedAt: new Date(), completedAt: new Date(), actorId: actor.user.id, actorName: actor.user.name || actor.user.email },
    }),
  ])
  return NextResponse.json({ success: true, alreadyApproved: false, productId: product.id, booksItemId: itemId, cost })
}
