import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), findProduct: vi.fn(), findProducts: vi.fn(), createProduct: vi.fn(), findAction: vi.fn(), transaction: vi.fn(), updateProduct: vi.fn(), upsertAction: vi.fn() }))
vi.mock('@/lib/session-user', () => ({ getAuthenticatedDbUser: mocks.auth }))
vi.mock('@/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findUnique: mocks.findProduct, findMany: mocks.findProducts, create: mocks.createProduct, update: mocks.updateProduct },
  operationalAction: { findUnique: mocks.findAction, upsert: mocks.upsertAction },
  $transaction: mocks.transaction,
} }))
import { POST } from './route'

const request = (body: object) => new Request('https://example.test/api/admin/lifecycle/approve-gift', { method: 'POST', body: JSON.stringify(body) })

describe('audited gift profit override', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ZOHO_ORGANIZATION_ID = 'test-org'
    mocks.auth.mockResolvedValue({ isAdmin: true, user: { id: 'admin-1', name: 'Admin' } })
    mocks.token.mockResolvedValue('protected-token')
    mocks.findProduct.mockResolvedValue({ id: 'hat-1', booksItemId: '1254360000043727500', sku: 'HAT', giftItem: true, unitCost: 20, costQuality: 'AUTHORITATIVE', attributes: {} })
    mocks.findProducts.mockResolvedValue([])
    mocks.createProduct.mockResolvedValue({ id: 'hat-1', booksItemId: '1254360000043727500', sku: 'HAT', giftItem: true, unitCost: 20, costQuality: 'AUTHORITATIVE', attributes: {} })
    mocks.findAction.mockResolvedValue(null)
    mocks.updateProduct.mockReturnValue({ kind: 'product-update' })
    mocks.upsertAction.mockReturnValue({ kind: 'audit-upsert' })
    mocks.transaction.mockResolvedValue([])
  })

  it('requires an administrator', async () => {
    mocks.auth.mockResolvedValue({ isAdmin: false, user: { id: 'rep-1' } })
    expect((await POST(request({ booksItemId: '1254360000043727500', reason: 'test' }))).status).toBe(403)
    expect(mocks.findProduct).not.toHaveBeenCalled()
  })

  it('refuses a gift whose cost is unknown', async () => {
    mocks.findProduct.mockResolvedValue({ id: 'gift-1', booksItemId: 'gift-books', sku: 'GIFT', giftItem: true, unitCost: null, costQuality: 'UNKNOWN', attributes: {} })
    expect((await POST(request({ booksItemId: 'gift-books', reason: 'Approved test gift.' }))).status).toBe(409)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('preserves authoritative cost and records an idempotent audited override', async () => {
    const response = await POST(request({ booksItemId: '1254360000043727500', reason: 'Authorized lifecycle test gift.' }))
    expect(response.status).toBe(200)
    expect(mocks.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'hat-1' },
      data: { attributes: expect.objectContaining({ giftProfitOverride: true, giftProfitOverrideReason: 'Authorized lifecycle test gift.' }) },
    }))
    expect(mocks.upsertAction).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'gift-profit-override:hat-1' },
      create: expect.objectContaining({ actionType: 'APPROVE_GIFT_PROFIT_OVERRIDE', result: { cost: 20 } }),
    }))
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('creates one exact local catalog projection from authoritative Books data when the mapping is missing', async () => {
    mocks.findProduct.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      item: { item_id: '1254360000043727500', sku: 'REAL-HAT', name: 'Titan Gift Hat', status: 'active', rate: 0, purchase_rate: 20, description: 'Gift hat' },
    }), { status: 200 })))

    const response = await POST(request({ booksItemId: '1254360000043727500', reason: 'Authorized lifecycle test gift.' }))
    expect(response.status).toBe(200)
    expect(mocks.createProduct).toHaveBeenCalledWith({ data: expect.objectContaining({
      booksItemId: '1254360000043727500', sku: 'REAL-HAT', price: 0, unitCost: 20,
      costQuality: 'AUTHORITATIVE', giftItem: true, subjectToVig: false,
    }) })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('reuses a unique exact-name gift when Books has no SKU', async () => {
    const shirt = { id: 'shirt-l', booksItemId: null, sku: '1254360000001558383', name: 'T-SHIRT - LARGE', giftItem: true, unitCost: null, costQuality: 'UNKNOWN', attributes: {} }
    mocks.findProduct.mockResolvedValue(null)
    mocks.findProducts.mockResolvedValue([shirt])
    mocks.updateProduct.mockResolvedValue({ ...shirt, booksItemId: '1254360000001558383', unitCost: 20, costQuality: 'AUTHORITATIVE' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      item: { item_id: '1254360000001558383', sku: '', name: 'T-SHIRT - LARGE', status: 'active', rate: 0, purchase_rate: 20 },
    }), { status: 200 })))

    const response = await POST(request({ booksItemId: '1254360000001558383', reason: 'Available shirt gift.' }))
    expect(response.status).toBe(200)
    expect(mocks.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shirt-l' },
      data: expect.objectContaining({ booksItemId: '1254360000001558383', price: 0, unitCost: 20, giftItem: true }),
    }))
    expect(mocks.createProduct).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
