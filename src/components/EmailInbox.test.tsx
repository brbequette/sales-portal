import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./ZohoProvider', () => ({ useZoho: () => ({ zohoContext: { id: 'rep', role: 'AGENT' } }) }))
vi.mock('./EmailSalesAssist', () => ({ EmailSalesAssist: () => null }))
import { EmailInbox } from './EmailInbox'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('opens the overall inbox, reads a message and switches folders without syncing providers', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('templates') ? { success: true, templates: [] } : { success: true, emails: [
    { id: 'in', subject: 'Invoice question', direction: 'INBOUND', status: 'RECEIVED', fromAddress: 'customer@example.test', toAddress: 'rep@example.test', body: 'Please confirm delivery.', receivedAt: '2026-10-07' },
    { id: 'out', subject: 'Our response', direction: 'OUTBOUND', status: 'SENT', fromAddress: 'rep@example.test', toAddress: 'customer@example.test', body: 'Thank you.', sentAt: '2026-10-07' },
  ] } }))
  vi.stubGlobal('fetch', fetcher); render(<EmailInbox />)
  const message = await screen.findByRole('button', { name: 'Read email: Invoice question' })
  expect(screen.queryByRole('button', { name: 'Read email: Our response' })).toBeNull()
  fireEvent.keyDown(message, { key: 'Enter' }); expect(screen.getByText('Please confirm delivery.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back to email inbox' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sent' }))
  await screen.findByRole('button', { name: 'Read email: Our response' })
  expect(fetcher.mock.calls.some(([url]) => url.includes('folder=sent'))).toBe(true)
  expect(fetcher.mock.calls.some(([url]) => url.includes('sync'))).toBe(false)
  expect(fetcher.mock.calls.filter(([url]) => url.includes('templates'))).toHaveLength(1)
})
it('shows inbox errors with a saved-data retry instead of claiming the mailbox is empty', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('templates') ? { success: true } : { success: false, error: 'Inbox temporarily unavailable' } }))
  vi.stubGlobal('fetch', fetcher); render(<EmailInbox />)
  expect((await screen.findByRole('alert')).textContent).toContain('Inbox temporarily unavailable')
  expect(screen.queryByText('No emails found')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry inbox' }))
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.includes('/api/emails?'))).toHaveLength(2))
})
