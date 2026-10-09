import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CollectionCardStatus } from './CollectionCardStatus'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows unknown without implying no saved card and only saves after explicit confirmation', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }); vi.stubGlobal('fetch', fetch)
  const saved = vi.fn()
  render(<CollectionCardStatus accountId="a" customerName="Customer" onSaved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Card on file: Unknown for Customer' }))
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yes' } })
  fireEvent.click(screen.getByText('Save status'))
  await waitFor(() => expect(saved).toHaveBeenCalledWith(true))
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ accountId: 'a', cardOnFile: true })
})
it('retains the editor and original status after a save failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Not saved' }) }))
  const saved = vi.fn()
  render(<CollectionCardStatus accountId="a" customerName="Customer" value={true} onSaved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Card on file: Yes for Customer' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'no' } })
  fireEvent.click(screen.getByText('Save status'))
  await waitFor(() => expect(screen.getByText('Save status')).toBeTruthy())
  expect(saved).not.toHaveBeenCalled(); expect(screen.getByRole('combobox')).toBeTruthy()
})
