import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ query: 'q=core' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.query) }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@/components/PublicProductImage', () => ({ PublicProductImage: () => null }))
import ShopClient from './ShopClient'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('updates the catalog search when navigation changes query on the same route', async () => {
  state.query = 'q=core'
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) }))
  vi.stubGlobal('fetch', fetch)
  const { rerender } = render(<ShopClient />)
  await waitFor(() => expect((screen.getByPlaceholderText('Search name, SKU, cut type, saw, size…') as HTMLInputElement).value).toBe('core'))
  state.query = 'q=turbo'
  rerender(<ShopClient />)
  await waitFor(() => expect((screen.getByPlaceholderText('Search name, SKU, cut type, saw, size…') as HTMLInputElement).value).toBe('turbo'))
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('shows a retryable error rather than a false empty catalog after a failed read', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ products: [] }) })
  vi.stubGlobal('fetch', fetch)
  render(<ShopClient />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry catalog' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(fetch).toHaveBeenCalledTimes(2)
})
