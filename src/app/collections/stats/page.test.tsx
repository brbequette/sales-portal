import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }))
vi.mock('@/components/CollectionOverview', () => ({ CollectionOverview: ({ invoiceId }: any) => <div>Invoice detail {invoiceId}</div> }))
import Page from './page'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const data = { calls: [], receipts: [], settings: { attributionDays: 30, dailyCallGoal: 30, monthlyRecoveryGoal: 25000 }, canEdit: false, company: false, userId: 'rep', managerId: null, plans: [], excludedPayments: 0, generatedAt: '2026-10-07' }
it('shows zero activity with unknown rates, and does not load compensation until selected', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data }); vi.stubGlobal('fetch', fetcher)
  render(<Page />); await screen.findByText('Calls logged')
  expect(screen.getAllByText('—').length).toBeGreaterThan(0); expect(fetcher).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'settings' }))
  expect(screen.queryByRole('button', { name: 'Save reporting settings' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'earnings' }))
  await screen.findByText(/No collections bonuses returned/); expect(fetcher).toHaveBeenCalledTimes(2)
})
it('shows a failed report as an error, not as zero successful collections', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Report unavailable' }) }))
  render(<Page />); expect((await screen.findByRole('alert')).textContent).toBe('Report unavailable')
  expect(screen.queryByText('Calls logged')).toBeNull()
})
