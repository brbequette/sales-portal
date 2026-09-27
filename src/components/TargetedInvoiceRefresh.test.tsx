import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TargetedInvoiceRefresh from './TargetedInvoiceRefresh'
import DealSyncAdmin from '@/app/admin/deal-sync/page'
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(cleanup)
function form() {
  render(<TargetedInvoiceRefresh />)
  fireEvent.change(screen.getByLabelText('Books invoice ID'), { target: { value: '1254360000050743136' } })
  fireEvent.change(screen.getByLabelText('Expected saved revision (UTC)'), { target: { value: '2026-09-25T17:02:10.419Z' } })
  return screen.getByRole('button', { name: 'Refresh metadata once' }).closest('form')!
}
it('submits one exact invoice and revision despite repeated submit events', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: 'SUCCEEDED', replay: false, providerCalls: 1, invoiceId: 'local', dueDate: '2026-10-15', private: 'hidden' }) } as Response)
  const target = form()
  fireEvent.submit(target); fireEvent.submit(target)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('SUCCEEDED'))
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ booksInvoiceId: '1254360000050743136', expectedUpdatedAt: '2026-09-25T17:02:10.419Z' })
  expect(screen.getByRole('status').textContent).not.toContain('hidden')
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
})
it('shows a sanitized failed response and stays locked', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'private response contents' }) } as Response)
  fireEvent.submit(form())
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('REFRESH_REQUIRES_REVIEW'))
  expect(screen.getByRole('status').textContent).not.toContain('private response')
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
})
it('never retries a network failure with unknown outcome', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'))
  const target = form(); fireEvent.submit(target)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('may have completed'))
  fireEvent.submit(target)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('does not show the form when the administrator status endpoint denies access', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Administrator access required' }) } as Response)
  render(<DealSyncAdmin />)
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Administrator access required'))
  expect(screen.queryByRole('button', { name: 'Refresh metadata once' })).toBeNull()
})
