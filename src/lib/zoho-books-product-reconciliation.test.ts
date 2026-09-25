import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findProducts: vi.fn(), updateProduct: vi.fn(), token: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: mocks.findProducts, update: mocks.updateProduct } } }))
vi.mock('@/lib/zoho-auth', () => ({ getZohoAccessToken: mocks.token }))
import { reconcileExactBooksProduct } from './zoho-books-product-reconciliation'

describe('exact Books product reconciliation', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ZOHO_ORGANIZATION_ID = 'test-org'; mocks.token.mockResolvedValue('token'); mocks.findProducts.mockResolvedValue([{ id: 'p1', canDropship: null }]) })

  it('persists authoritative rates but keeps dropship blocked without explicit evidence', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, item: { item_id: 'bi1', sku: 'RFD-50A060', status: 'active', rate: .91, purchase_rate: .36, item_type: 'sales_and_purchases', product_type: 'goods', vendor_id: 'v1', track_inventory: false, inventory_account_id: 'inventory-account' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, contact: { contact_id: 'v1', status: 'active', contact_type: 'vendor' } }) }))
    await expect(reconcileExactBooksProduct('RFD-50A060', 'bi1')).resolves.toMatchObject({ state: 'SUCCEEDED', dropshipEligibility: 'BLOCKED_UNKNOWN' })
    expect(mocks.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ price: .91, unitCost: .36, costQuality: 'AUTHORITATIVE', canDropship: null }) }))
  })

  it('does not infer dropship eligibility from vendor or zero inventory', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, item: { item_id: 'bi1', sku: 'RFD-50A060', status: 'active', rate: .91, purchase_rate: .36, item_type: 'sales_and_purchases', product_type: 'goods', preferred_vendor_id: 'v1', track_inventory: false, stock_on_hand: 0 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, contact: { contact_id: 'v1', status: 'active', contact_type: 'vendor' } }) }))
    await expect(reconcileExactBooksProduct('RFD-50A060', 'bi1')).resolves.toMatchObject({ state: 'SUCCEEDED', dropshipEligibility: 'BLOCKED_UNKNOWN' })
    expect(mocks.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canDropship: null }) }))
  })

  it('preserves audited application-managed dropship authorization', async () => {
    mocks.findProducts.mockResolvedValue([{ id: 'p1', canDropship: true }])
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, item: { item_id: 'bi1', sku: 'RFD-50A060', status: 'active', rate: .91, purchase_rate: .36, item_type: 'sales_and_purchases', product_type: 'goods', preferred_vendor_id: 'v1', track_inventory: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, contact: { contact_id: 'v1', status: 'active', contact_type: 'vendor' } }) }))
    await expect(reconcileExactBooksProduct('RFD-50A060', 'bi1')).resolves.toMatchObject({ state: 'SUCCEEDED', dropshipEligibility: 'AUTHORIZED' })
    expect(mocks.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canDropship: true }) }))
  })
})
