import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findProduct: vi.fn(), findAction: vi.fn(), transaction: vi.fn(), updateProduct: vi.fn(), upsertAction: vi.fn() }))
vi.mock('@/lib/session-user', () => ({ getAuthenticatedDbUser: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findUnique: mocks.findProduct, update: mocks.updateProduct },
  operationalAction: { findUnique: mocks.findAction, upsert: mocks.upsertAction },
  $transaction: mocks.transaction,
} }))
import { POST } from './route'

const request = (body: object) => new Request('https://example.test/api/admin/lifecycle/approve-gift', { method: 'POST', body: JSON.stringify(body) })

describe('audited gift profit override', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ isAdmin: true, user: { id: 'admin-1', name: 'Admin' } })
    mocks.findProduct.mockResolvedValue({ id: 'hat-1', booksItemId: '1254360000043727500', sku: 'HAT', giftItem: true, unitCost: 20, costQuality: 'AUTHORITATIVE', attributes: {} })
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
})
