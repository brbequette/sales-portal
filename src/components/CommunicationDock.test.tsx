import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { CommunicationDock } from './CommunicationDock'
import { publishCommunicationContext, screenOneFramePath } from '@/lib/communication-context'

const mounts = vi.hoisted(() => ({ phone: 0, ai: 0 }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }))
vi.mock('./TitanVoiceSoftphone', () => ({ TitanVoiceSoftphone: ({ onCallState }: { onCallState: (value: unknown) => void }) => {
  useEffect(() => { mounts.phone++; return () => { mounts.phone-- } }, [])
  return <button onClick={() => onCallState({ status: 'incoming', accountId: 'account-b', name: 'Customer B' })}>Simulate incoming call</button>
} }))
vi.mock('./AiAssistant', () => ({ AiAssistant: () => {
  useEffect(() => { mounts.ai++; return () => { mounts.ai-- } }, [])
  return <input aria-label="AI draft" />
} }))
vi.mock('./CommunicationCenter', () => ({ CommunicationCenter: ({ accountId }: { accountId: string }) => {
  const [draft, setDraft] = useState('')
  return <input aria-label={`Message for ${accountId}`} value={draft} onChange={event => setDraft(event.target.value)} />
} }))

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })))
  publishCommunicationContext(null)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ account: { id: url.includes('account-b') ? 'account-b' : 'account-a', name: 'Customer', contacts: [] } }) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('unified communications panel', () => {
  it('follows current account next steps without redirecting the saved messaging draft', async () => {
    render(<CommunicationDock />)
    act(() => publishCommunicationContext({ accountId: 'account-a', title: 'Customer A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
    fireEvent.click(screen.getByRole('button', { name: /^Messages$/ }))
    await waitFor(() => expect(screen.getByLabelText('Message for account-a')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for account-a'), { target: { value: 'Keep customer A draft' } })
    act(() => publishCommunicationContext({ accountId: 'account-b', title: 'Customer B' }))
    fireEvent.click(screen.getByRole('button', { name: /^Next steps$/ }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Quote / order' }).getAttribute('href')).toContain('account-b'))
    fireEvent.click(screen.getByRole('button', { name: /^Messages$/ }))
    expect((screen.getByLabelText('Message for account-a') as HTMLInputElement).value).toBe('Keep customer A draft')
  })
  it('opens the shared phone panel for a dialer shortcut without a phone number', () => {
    render(<CommunicationDock />)
    act(() => { window.dispatchEvent(new CustomEvent('inAppDial', { detail: { phone: '' } })) })
    expect(screen.getByRole('region', { name: 'Communications workspace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Phone' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('offers one launcher and preserves phone and AI instances across tab switches and minimize', () => {
    render(<CommunicationDock />)
    expect(screen.getAllByRole('button', { name: 'Open Titan communications' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    fireEvent.change(screen.getByLabelText('AI draft'), { target: { value: 'Keep this question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minimize communications' }))
    expect(mounts).toEqual({ phone: 1, ai: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect((screen.getByLabelText('AI draft') as HTMLInputElement).value).toBe('Keep this question')
  })

  it('does not silently move an unsent message to a different conversation', async () => {
    render(<CommunicationDock />)
    act(() => publishCommunicationContext({ accountId: 'account-a', title: 'Customer A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Titan communications' }))
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
    await waitFor(() => expect(screen.getByLabelText('Message for account-a')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Message for account-a'), { target: { value: 'Unsent draft' } })
    act(() => publishCommunicationContext({ accountId: 'account-b', title: 'Customer B' }))
    expect((screen.getByLabelText('Message for account-a') as HTMLInputElement).value).toBe('Unsent draft')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /Use current conversation/ }))
    expect(screen.queryByLabelText('Message for account-b')).toBeNull()
  })

  it('opens the same phone panel for incoming calls and AI events', () => {
    render(<CommunicationDock />)
    act(() => window.dispatchEvent(new Event('openTitanAi')))
    expect(screen.getByRole('button', { name: 'AI' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    fireEvent.click(screen.getByText('Simulate incoming call'))
    expect(screen.getByRole('button', { name: 'Phone' }).getAttribute('aria-pressed')).toBe('true')
    expect(mounts.phone).toBe(1)
  })
})

describe('second screen workspace paths', () => {
  it.each(['https://example.com', '//example.com', '/display', '/communications?x=1', '/api/send-sms'])('rejects unsafe or recursive source %s', path => {
    expect(screenOneFramePath(path)).toBeNull()
  })
  it('preserves selected account and adds the embedded-workspace flag', () => {
    expect(screenOneFramePath('/account?id=customer-1')).toBe('/account?id=customer-1&display=1')
  })
})
