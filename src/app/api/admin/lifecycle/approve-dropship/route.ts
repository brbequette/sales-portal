import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdministrator } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

const SKU = 'RFD-50A060'
const VENDOR_NAME = 'CONTINENTAL ABRASIVES'
const CONFIRMATION = `APPROVE ${SKU} DROPSHIP`

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  if (!auth.session?.user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const reason = String(body?.reason || '').trim()
  if (body?.confirmation !== CONFIRMATION || body?.sku !== SKU || body?.vendorName !== VENDOR_NAME || reason.length < 10) {
    return NextResponse.json({
      success: false,
      error: `Exact SKU, vendor, confirmation (${CONFIRMATION}), and an approval reason are required.`,
    }, { status: 400 })
  }

  const product = await prisma.product.findUnique({ where: { sku: SKU } })
  if (!product || !product.booksItemId || product.costQuality !== 'AUTHORITATIVE' || !(Number(product.unitCost) > 0) || product.vendor == null) {
    return NextResponse.json({ success: false, error: 'The exact product lacks authoritative Books identity, cost, or vendor evidence.' }, { status: 409 })
  }
  const vendors = await prisma.vendor.findMany({
    where: { zohoId: product.vendor, companyName: VENDOR_NAME, status: { equals: 'active', mode: 'insensitive' } },
    take: 2,
  })
  if (vendors.length !== 1) {
    return NextResponse.json({ success: false, error: 'The exact active preferred vendor could not be uniquely verified.' }, { status: 409 })
  }

  const idempotencyKey = `product-dropship-approval:${product.id}:${vendors[0].id}`
  const prior = await prisma.operationalAction.findUnique({ where: { idempotencyKey } })
  if (prior?.status === 'SUCCEEDED' && product.canDropship === true) {
    return NextResponse.json({ success: true, replayed: true, productId: product.id, sku: SKU, vendorName: VENDOR_NAME })
  }

  const actorId = auth.session.user.dbId || auth.session.user.id || null
  const actorName = auth.session.user.name || auth.session.user.email || 'Administrator'
  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { canDropship: true } }),
    prisma.operationalAction.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        actionType: 'APPROVE_PRODUCT_DROPSHIP',
        entityType: 'PRODUCT',
        entityId: product.id,
        entityNumber: SKU,
        status: 'SUCCEEDED',
        payload: {
          sku: SKU,
          booksItemId: product.booksItemId,
          vendorId: vendors[0].id,
          vendorZohoId: vendors[0].zohoId,
          vendorName: VENDOR_NAME,
          previousCanDropship: product.canDropship,
          approvalReason: reason,
          approvalReasonSha256: createHash('sha256').update(reason).digest('hex'),
          approvalScope: 'DIRECT_DROPSHIP',
        } as Prisma.InputJsonValue,
        result: { canDropship: true } as Prisma.InputJsonValue,
        actorId,
        actorName,
        attemptCount: 1,
        maxAttempts: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
      update: {},
    }),
  ])

  return NextResponse.json({ success: true, replayed: false, productId: product.id, sku: SKU, vendorName: VENDOR_NAME })
}
