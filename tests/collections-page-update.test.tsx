import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ cache: vi.fn(), fetch: vi.fn() }))
vi.mock('@/components/ZohoProvider', () => ({ useZoho: () => ({ zohoContext: { id: 'rep', email: 'rep@example.com', role: 'AGENT' } }) }))
vi.mock('@/components/CollectionsModal', () => ({ CollectionsModal: () => null }))
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
