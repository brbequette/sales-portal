// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), products: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: mocks.products } } }))
import { GET } from './route'
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { role: 'AGENT' } }) })
it('rejects unauthenticated inventory access before reading products', async () => {
  mocks.session.mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect(mocks.products).not.toHaveBeenCalled()
})
it('reads only explicitly designated gifts without truncating inventory or exposing internal costs', async () => {
  mocks.products.mockResolvedValue([{ id: 'gift', stock: -2 }])
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const query = mocks.products.mock.calls[0][0]
  expect(query.where).toEqual({ giftItem: true })
  expect(query.take).toBeUndefined()
  expect(query.select.unitCost).toBeUndefined()
  expect((await response.json()).products[0].stock).toBe(-2)
})
it('reports a failed load instead of displaying empty successful inventory', async () => {
  mocks.products.mockRejectedValue(new Error('private database details'))
  const response = await GET()
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain('private database details')
})
