import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { SalesNextSteps } from './SalesNextSteps'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('supports an account opened by Zoho ID and links follow-ups to its canonical app ID', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ account: { id: 'local-account', name: 'Customer', deals: [{ id: 'deal', stage: 'Proposal' }] } }) })))
  render(<SalesNextSteps accountId="1254360000039032015" />)
  await waitFor(() => expect(screen.getByRole('link', { name: 'Schedule follow-up' }).getAttribute('href')).toContain('accountId=local-account'))
})
