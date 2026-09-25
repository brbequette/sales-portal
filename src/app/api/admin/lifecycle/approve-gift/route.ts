import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedDbUser } from '@/lib/session-user'

export async function POST(request: Request) {
  const actor = await getAuthenticatedDbUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.isAdmin) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  const { booksItemId, reason } = await request.json().catch(() => ({}))
  const itemId = String(booksItemId || '').trim()
  const auditReason = String(reason || '').trim()
  if (!itemId || !auditReason) return NextResponse.json({ error: 'booksItemId and reason are required' }, { status: 400 })

  const product = await prisma.product.findUnique({ where: { booksItemId: itemId } })
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
