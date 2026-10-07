import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ cache: vi.fn(), fetch: vi.fn() }))
vi.mock('@/components/ZohoProvider', () => ({ useZoho: () => ({ zohoContext: { id: 'rep', email: 'rep@example.com', role: 'AGENT' } }) }))
vi.mock('@/components/CollectionsModal', () => ({ CollectionsModal: ({ mode }: { mode: string }) => <div role="dialog">{mode}</div> }))
vi.mock('@/components/CollectionOverview', () => ({ CollectionOverview: ({ invoice }: { invoice: { id: string } }) => <section aria-label={`Expanded ${invoice.id}`} /> }))
import { getCommunicationContext } from '../src/lib/communication-context'
import { prepareInAppCall } from '../src/lib/internal-phone'
vi.mock('@/components/PeriodSelector', () => ({ PeriodSelector: () => null, isInPeriod: () => true }))
vi.mock('@/lib/internal-phone', () => ({ prepareInAppCall: vi.fn() }))
vi.mock('@/lib/dataCache', () => ({ sessionGet: mocks.cache, sessionSet: vi.fn(), TTL: { TEN_MIN: 600000 } }))
import CollectionsPage from '../src/app/collections/page'
const response = (data: object) => ({ ok: true, json: async () => ({ success: true, ...data }) })
const full = (sig: string) => response({ invoices: [], dataSignature: sig, canViewCompanyCollections: false })
const check = (sig: string) => response({ checkOnly: true, dataSignature: sig })
async function settle() { await act(async () => { await Promise.resolve() }) }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(2000) }) }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.cache.mockReturnValue(null); vi.stubGlobal('fetch', mocks.fetch) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('does not report updates after initial load or repeated refreshes of unchanged data', async () => {
  mocks.fetch.mockImplementation(async (url: string) => url.includes('checkOnly') ? check('same') : full('same'))
  render(<CollectionsPage />); await settle(); await tick()
  expect(screen.queryByText('Collections data updated')).toBeNull()
  fireEvent.click(screen.getByTitle('Refresh')); await settle(); await tick()
  expect(screen.queryByText('Collections data updated')).toBeNull()
})
it('compares a cached snapshot and clears the alert after loading the new version', async () => {
  mocks.cache.mockReturnValue({ invoices: [], canViewCompanyCollections: false, dataSignature: 'old' })
  mocks.fetch.mockImplementation(async (url: string) => url.includes('checkOnly') ? check('new') : full('new'))
  render(<CollectionsPage />); await settle(); await tick()
  expect(screen.queryByText('Collections data updated')).not.toBeNull()
  fireEvent.click(screen.getByText('Update Now')); await settle(); await tick()
  expect(screen.queryByText('Collections data updated')).toBeNull()
})
it('ignores a delayed obsolete check after a manual refresh', async () => {
  let finish: (value: unknown) => void = () => {}
  mocks.fetch.mockResolvedValueOnce(full('old')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(full('new')).mockResolvedValue(check('new'))
  render(<CollectionsPage />); await settle(); await tick()
  fireEvent.click(screen.getByTitle('Refresh')); await settle()
  await act(async () => { finish(check('obsolete')) })
  expect(screen.queryByText('Collections data updated')).toBeNull()
  await tick()
  expect(screen.queryByText('Collections data updated')).toBeNull()
})
it('does not show an update when the background check fails', async () => {
  mocks.fetch.mockResolvedValueOnce(full('old')).mockRejectedValueOnce(new Error('offline'))
  render(<CollectionsPage />); await settle(); await tick()
  expect(screen.queryByText('Collections data updated')).toBeNull()
})

it('expands a row with local account context while call and payment controls keep their own actions', async () => {
  mocks.fetch.mockResolvedValue(response({ invoices: [{ id: 'invoice-1', account_id: 'local-account', customer_id: 'zoho-account', invoice_number: '11001', customer_name: 'Example Customer', balance: 150, days_overdue: 20, customer_contacts: [{ id: 'contact', name: 'Example Contact', phone: '5550101' }] }], dataSignature: 'same' }))
  render(<CollectionsPage />); await settle()
  fireEvent.click(screen.getByRole('button', { name: /Invoice #11001/ }))
  expect(screen.getByRole('region', { name: 'Expanded invoice-1' })).toBeTruthy()
  expect(getCommunicationContext()).toMatchObject({ recordId: 'invoice-1', accountId: 'local-account', kind: 'Invoice' })
  fireEvent.click(screen.getByRole('button', { name: /Example Contact/ }))
  expect(prepareInAppCall).toHaveBeenCalledWith('5550101', expect.objectContaining({ accountId: 'local-account' }))
  expect(screen.getByRole('region', { name: 'Expanded invoice-1' })).toBeTruthy()
  fireEvent.click(screen.getByTitle('Run Card'))
  expect(screen.getByRole('dialog').textContent).toBe('card')
  expect(screen.getByRole('region', { name: 'Expanded invoice-1' })).toBeTruthy()
})
