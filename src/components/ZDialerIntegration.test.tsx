import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('./ZohoProvider', () => ({ useZoho: () => ({ zohoContext: { id: 'rep', name: 'Rep' } }) }))
import { TitanVoiceSoftphone } from './TitanVoiceSoftphone'
import { useCommunicationData } from './useCommunicationData'

const contacts = [{ id: 'c1', firstName: 'Primary', isPrimary: true, phone: '4805550100' }, { id: 'c2', firstName: 'Selected', phone: '6185550100' }]
const account = { id: 'a1', name: 'Customer' }
let sendResponse: Record<string, unknown>
beforeEach(() => {
  sendResponse = { success: true, providerAccepted: true, smsMessage: { id: 'sms-1', body: 'Send inside Titan', createdAt: '2026-10-07T18:00:00Z' } }
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows Chrome')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url === '/api/send-sms' ? sendResponse : { success: true, numbers: [{ active: true, number: '+14805550100' }], products: [], notes: [], messages: [], account: {}, settings: {} } })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps calls on ZDialer without SDK registration, directory polling or fabricated call state', () => {
  const state = vi.fn()
  render(<TitanVoiceSoftphone onCallState={state} />)
  fireEvent(window, new CustomEvent('inAppDial', { detail: { phone: '+16185550100', accountName: 'Customer' } }))
  expect(screen.getByRole('region', { name: 'ZDialer phone' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Connect phone' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Text this number in ZDialer/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Call with ZDialer' }))
  expect(fetch).not.toHaveBeenCalled()
  expect(state.mock.calls.every(([value]) => value.status === 'idle')).toBe(true)
})

it.each(['Windows Chrome', 'iPhone Safari', 'Android Chrome'])('sends the selected contact and sender inside Titan on %s', async userAgent => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  const external = vi.fn()
  window.addEventListener('titan:zdialer-message', external)
  const { result } = renderHook(() => useCommunicationData({ accountId: 'a1', account, contacts, selectedContactId: 'c2' }))
  await waitFor(() => expect(result.current.selectedOutboundNumber).toBe('+14805550100'))
  act(() => result.current.setSmsText('Send inside Titan'))
  await act(async () => { await result.current.sendSMS() })
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/send-sms')
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1]?.body as string)).toMatchObject({ accountId: 'a1', contactId: 'c2', message: 'Send inside Titan', fromNumber: '+14805550100', requestId: expect.any(String) })
  expect(result.current.smsText).toBe('')
  expect(result.current.chatMessages).toContainEqual(expect.objectContaining({ id: 'sms-1', text: 'Send inside Titan' }))
  expect(external).not.toHaveBeenCalled()
  window.removeEventListener('titan:zdialer-message', external)
})

it('retains the draft without adding a sent message when the provider rejects it', async () => {
  sendResponse = { success: false, error: 'SMS blocked: opt out' }
  const { result } = renderHook(() => useCommunicationData({ accountId: 'a1', account, contacts, selectedContactId: 'c2' }))
  await waitFor(() => expect(result.current.selectedOutboundNumber).toBeTruthy())
  act(() => result.current.setSmsText('Keep this draft'))
  await act(async () => { await result.current.sendSMS() })
  expect(result.current.smsText).toBe('Keep this draft')
  expect(result.current.chatMessages).toHaveLength(0)
})

it('reuses the operation ID after an unknown provider outcome to prevent duplicate sends', async () => {
  sendResponse = { success: false, error: 'Unknown provider outcome' }
  const { result } = renderHook(() => useCommunicationData({ accountId: 'a1', account, contacts }))
  await waitFor(() => expect(result.current.selectedOutboundNumber).toBeTruthy())
  act(() => result.current.setSmsText('Keep this draft'))
  await act(async () => { await result.current.sendSMS() })
  await act(async () => { await result.current.sendSMS() })
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/send-sms').map(([,options]) => JSON.parse(options?.body as string))
  expect(calls).toHaveLength(2)
  expect(calls[1].requestId).toBe(calls[0].requestId)
  expect(result.current.smsText).toBe('Keep this draft')
  expect(result.current.chatMessages).toHaveLength(0)
})
