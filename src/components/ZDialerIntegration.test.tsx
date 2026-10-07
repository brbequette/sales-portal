import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./ZohoProvider', () => ({ useZoho: () => ({ zohoContext: { id: 'rep', name: 'Rep' } }) }))
import { TitanVoiceSoftphone } from './TitanVoiceSoftphone'
import { useCommunicationData } from './useCommunicationData'
import { ZDIALER_MESSAGE_EVENT } from '@/lib/zdialer'
beforeEach(() => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows Chrome')
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, products: [], notes: [], messages: [], account: {}, settings: {} }) })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('defaults to ZDialer without SDK registration, directory polling, preflight calls or fabricated call state', () => {
  const state = vi.fn()
  render(<TitanVoiceSoftphone onCallState={state} />)
  fireEvent(window, new CustomEvent('inAppDial', { detail: { phone: '+16185550100', accountName: 'Customer' } }))
  expect(screen.getByRole('region', { name: 'ZDialer phone' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Connect phone' })).toBeNull()
  expect((screen.getByLabelText('Phone number or extension') as HTMLInputElement).value).toBe('+16185550100')
  fireEvent.click(screen.getByRole('button', { name: 'Call with ZDialer' }))
  expect(fetch).not.toHaveBeenCalled()
  expect(state.mock.calls.every(([value]) => value.status === 'idle')).toBe(true)
})
it('routes the selected account contact and draft into ZDialer without submitting SMS or clearing text', async () => {
  const listener = vi.fn()
  window.addEventListener(ZDIALER_MESSAGE_EVENT, listener)
  const contacts = [{ id: 'c1', firstName: 'Primary', isPrimary: true, phone: '4805550100' }, { id: 'c2', firstName: 'Selected', phone: '6185550100' }]
  const account = { id: 'a1', name: 'Customer' }
  const { result } = renderHook(() => useCommunicationData({ accountId: 'a1', account, contacts, selectedContactId: 'c2' }))
  await waitFor(() => expect(result.current.primaryContact?.id).toBe('c2'))
  act(() => result.current.setSmsText('Keep this draft'))
  await act(async () => { await result.current.sendSMS() })
  expect(listener).toHaveBeenCalledOnce()
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ phone: '6185550100', accountId: 'a1', contactId: 'c2', message: 'Keep this draft' })
  expect(result.current.smsText).toBe('Keep this draft')
  expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).includes('manage-zoho-numbers') || (String(url).includes('send-sms') && options?.method === 'POST'))).toBe(false)
  window.removeEventListener(ZDIALER_MESSAGE_EVENT, listener)
})
