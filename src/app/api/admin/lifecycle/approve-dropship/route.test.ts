import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findProduct: vi.fn(), findVendors: vi.fn(), findAction: vi.fn(), transaction: vi.fn(),
  updateProduct: vi.fn(), upsertAction: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAdministrator: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findUnique: mocks.findProduct, update: mocks.updateProduct },
  vendor: { findMany: mocks.findVendors },
  operationalAction: { findUnique: mocks.findAction, upsert: mocks.upsertAction },
  $transaction: mocks.transaction,
} }))
import { POST } from './route'

function request(body: object) {
  return new Request('https://example.test/api/admin/lifecycle/approve-dropship', { method: 'POST', body: JSON.stringify(body) })
}

describe('audited dropship authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ session: { user: { dbId: 'admin-1', name: 'Admin' } }, errorResponse: null })
    mocks.findProduct.mockResolvedValue({ id: 'p1', sku: 'RFD-50A060', booksItemId: 'books-1', unitCost: .36, costQuality: 'AUTHORITATIVE', vendor: 'vendor-zoho-1', canDropship: null })
    mocks.findVendors.mockResolvedValue([{ id: 'v1', zohoId: 'vendor-zoho-1', companyName: 'CONTINENTAL ABRASIVES', status: 'active' }])
    mocks.findAction.mockResolvedValue(null)
    mocks.updateProduct.mockReturnValue({ kind: 'product-update' })
    mocks.upsertAction.mockReturnValue({ kind: 'audit-upsert' })
    mocks.transaction.mockResolvedValue([])
  })

  it('requires exact explicit confirmation', async () => {
    const response = await POST(request({ sku: 'RFD-50A060', vendorName: 'CONTINENTAL ABRASIVES', confirmation: 'yes', reason: 'Approved by administrator.' }))
    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('records the exact product authorization and immutable audit evidence atomically', async () => {
    const response = await POST(request({ sku: 'RFD-50A060', vendorName: 'CONTINENTAL ABRASIVES', confirmation: 'APPROVE RFD-50A060 DROPSHIP', reason: 'Vendor approved by business owner for this test.' }))
    expect(response.status).toBe(200)
    expect(mocks.updateProduct).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { canDropship: true } })
    expect(mocks.upsertAction).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'product-dropship-approval:p1:v1' },
      create: expect.objectContaining({ actionType: 'APPROVE_PRODUCT_DROPSHIP', status: 'SUCCEEDED', maxAttempts: 1 }),
      update: {},
    }))
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('replays an already completed authorization without another write', async () => {
    mocks.findProduct.mockResolvedValue({ id: 'p1', sku: 'RFD-50A060', booksItemId: 'books-1', unitCost: .36, costQuality: 'AUTHORITATIVE', vendor: 'vendor-zoho-1', canDropship: true })
    mocks.findAction.mockResolvedValue({ status: 'SUCCEEDED' })
    const response = await POST(request({ sku: 'RFD-50A060', vendorName: 'CONTINENTAL ABRASIVES', confirmation: 'APPROVE RFD-50A060 DROPSHIP', reason: 'Vendor approved by business owner for this test.' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, replayed: true })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
