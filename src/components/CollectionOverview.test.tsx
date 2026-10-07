// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CollectionOverview } from './CollectionOverview'
const invoice: any = { id: 'i1', invoice_number: '11001', customer_name: 'Customer', balance: 90, total: 100, due_date: '2026-09-01', days_overdue: 36 }
const line = { name: 'Blade', sku: 'B14', quantity: 2, unitPrice: 50, total: 100, unitCost: null }
const data = { account: { name: 'Customer', contacts: [], owner: { name: 'Rep' } }, documents: [{ id: 'i1', type: 'Invoice', number: '11001', lines: [line], updatedAt: '2026-10-01' }, { id: 's1', type: 'Sales order', number: '46001', lines: [line] }], packages: [], purchases: [], payments: [] }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows shared line items once and opens granular details in a body portal', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data }); vi.stubGlobal('fetch', fetcher)
  const { container } = render(<CollectionOverview invoice={invoice} />)
  await waitFor(() => expect(screen.queryByText('Loading saved order details…')).toBeNull())
  fireEvent.click(screen.getByRole('tab', { name: 'Items & costs' }))
  expect(screen.getAllByRole('button', { name: 'Blade' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Blade' }))
  const dialog = screen.getByRole('dialog', { name: 'Blade' })
  expect(container.contains(dialog)).toBe(false)
  fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('shows failures and lets the user retry without claiming empty history', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unavailable' }) }).mockResolvedValueOnce({ ok: true, json: async () => data }))
  render(<CollectionOverview invoice={invoice} />)
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
