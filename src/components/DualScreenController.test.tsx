import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DualScreenController } from './DualScreenController'
import { CommunicationDock } from './CommunicationDock'
import { setDisplayConnected, setLocalCallActive } from '@/lib/communication-layout'
import { publishCommunicationContext } from '@/lib/communication-context'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }))
vi.mock('./EmailInbox', () => ({ EmailInbox: () => null }))
vi.mock('./TitanVoiceSoftphone', () => ({ TitanVoiceSoftphone: () => null }))
vi.mock('./CommunicationCenter', () => ({ CommunicationCenter: () => null }))
vi.mock('./CommunicationSearch', () => ({ CommunicationSearch: () => null }))
vi.mock('./SalesNextSteps', () => ({ SalesNextSteps: () => null }))
vi.mock('./AiAssistant', () => ({ AiAssistant: () => <input aria-label="AI draft" /> }))
class Channel {
  static latest: Channel
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()
  constructor() { Channel.latest = this }
  receive(type: string, controllerId = 'controller') {
    act(() => this.onmessage?.({ data: { id: crypto.randomUUID(), sourceId: 'display', displayId: 'display', sequence: 1, type, controllerId } }))
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.setItem('titan-dual-screen-controller-id', 'controller')
  vi.stubGlobal('BroadcastChannel', Channel)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.spyOn(window, 'open').mockReturnValue({ focus: vi.fn(), closed: false } as unknown as Window)
  setDisplayConnected(false); setLocalCallActive(false); publishCommunicationContext(null)
})
afterEach(() => { cleanup(); setDisplayConnected(false); setLocalCallActive(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('waits for a paired display, hides the dock, then restores its draft when that display closes', () => {
  render(<><DualScreenController /><CommunicationDock /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
  fireEvent.click(screen.getByRole('button', { name: 'AI' }))
  fireEvent.change(screen.getByLabelText('AI draft'), { target: { value: 'Keep my question' } })
  fireEvent.click(screen.getByTitle('Open the standalone communicator for this account'))
  expect(screen.getByRole('region', { name: 'Communications workspace' })).toBeTruthy()
  Channel.latest.receive('DISPLAY_READY', 'different-controller')
  expect(screen.getByRole('region', { name: 'Communications workspace' })).toBeTruthy()
  Channel.latest.receive('DISPLAY_READY')
  expect(screen.queryByRole('region', { name: 'Communications workspace' })).toBeNull()
  Channel.latest.receive('DISPLAY_CLOSING')
  expect((screen.getByLabelText('AI draft') as HTMLInputElement).value).toBe('Keep my question')
  expect(screen.getByRole('region', { name: 'Communications workspace' })).toBeTruthy()
})
it('restores the dock after a display stops sending heartbeats', () => {
  render(<><DualScreenController /><CommunicationDock /></>)
  Channel.latest.receive('DISPLAY_READY')
  expect(screen.queryByRole('button', { name: 'Open Titan communications' })).toBeNull()
  act(() => vi.advanceTimersByTime(8000))
  expect(screen.getByRole('button', { name: 'Open Titan communications' })).toBeTruthy()
})
it('relays communication shortcuts once without running the hidden local dialer handler', () => {
  render(<DualScreenController />)
  Channel.latest.receive('DISPLAY_READY')
  const local = vi.fn()
  window.addEventListener('inAppDial', local)
  act(() => window.dispatchEvent(new CustomEvent('inAppDial', { detail: { phone: '5551234567', accountId: 'a', ignored: 'secret' } })))
  expect(local).not.toHaveBeenCalled()
  expect(Channel.latest.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMMUNICATION_ACTION', action: { event: 'inAppDial', detail: { phone: '5551234567', accountId: 'a' } } }))
  window.removeEventListener('inAppDial', local)
})
it('never opens a second screen on mobile and keeps the local communicator available', () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
  render(<><DualScreenController /><CommunicationDock /></>)
  act(() => window.dispatchEvent(new Event('titan:open-second-screen')))
  Channel.latest.receive('DISPLAY_READY')
  expect(window.open).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Second display controls' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
  expect(screen.queryByRole('button', { name: 'Open second screen' })).toBeNull()
})
it('forwards a ZDialer SMS draft and exact contact to the paired display once', () => {
  render(<DualScreenController />)
  Channel.latest.receive('DISPLAY_READY')
  const local = vi.fn()
  window.addEventListener('titan:zdialer-message', local)
  const detail = { phone: '+16185550100', accountId: 'a', contactId: 'c', message: 'Keep this draft' }
  act(() => window.dispatchEvent(new CustomEvent('titan:zdialer-message', { detail })))
  expect(local).not.toHaveBeenCalled()
  expect(Channel.latest.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMMUNICATION_ACTION', action: { event: 'titan:zdialer-message', detail } }))
  window.removeEventListener('titan:zdialer-message', local)
})
it('does not move an active call to a new window', () => {
  render(<DualScreenController />)
  setLocalCallActive(true)
  act(() => window.dispatchEvent(new Event('titan:open-second-screen')))
  expect(window.open).not.toHaveBeenCalled()
})
it('focuses an existing communicator without navigating it again and losing its draft', () => {
  render(<DualScreenController />)
  fireEvent.click(screen.getByTitle('Open the standalone communicator for this account'))
  Channel.latest.receive('DISPLAY_READY')
  fireEvent.click(screen.getByTitle('Open the standalone communicator for this account'))
  expect(window.open).toHaveBeenCalledTimes(1)
})
