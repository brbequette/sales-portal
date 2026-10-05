import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ orders: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  salesOrder: { findMany: mocks.orders },
  package: { findMany: vi.fn().mockResolvedValue([]) },
  purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
} }))
vi.mock('@/lib/session-user', () => ({ getAuthenticatedDbUser: vi.fn().mockResolvedValue({ isAdmin: true, user: { id: 'admin' } }) }))
vi.mock('@/lib/database-read-metadata', () => ({
  getDatabaseFreshness: vi.fn().mockResolvedValue({}),
  databaseReadHeaders: vi.fn().mockReturnValue({}),
  LOCAL_DATA_INCOMPLETE: 'Incomplete',
}))
import { GET } from './route'

async function shippingOrder(items: object, contacts: object[] = []) {
  mocks.orders.mockResolvedValue([{ id: 'so-test', zohoId: 'zoho-test', orderDate: new Date(),
    status: 'Confirmed', amount: 10, items, account: { id: 'customer', name: 'Recipient', contacts } }])
  const response = await GET(new NextRequest('https://example.test/api/shipping'))
  expect(response.status).toBe(200)
  return (await response.json()).data[0]
}

describe('shipping recipient phone mapping', () => {
  beforeEach(() => mocks.orders.mockReset())
  it('preserves the destination phone when rebuilding a Zoho shipping address', async () => {
    const order = await shippingOrder({ shipping_address: { address: '123 Test St', city: 'Phoenix', phone: ' +16025550101 ' } }, [{ phone: '+16025550102' }])
    expect(order.shippingAddress.phone).toBe('+16025550101')
    expect(order.customerPhone).toBe('+16025550101')
  })
  it('uses the unique primary contact mobile when the destination phone is blank', async () => {
    const order = await shippingOrder({ shipping_address: { city: 'Phoenix', phone: ' ' } }, [{ phone: '', mobilePhone: '+16025550102' }])
    expect(order.shippingAddress.phone).toBe('+16025550102')
  })
  it('does not choose arbitrarily between multiple primary contacts or invent a number', async () => {
    const order = await shippingOrder({ shipping_address: { city: 'Phoenix' } }, [{ phone: '+16025550101' }, { phone: '+16025550102' }])
    expect(order.shippingAddress.phone).toBe('')
    expect(order.customerPhone).toBe('')
  })
})
