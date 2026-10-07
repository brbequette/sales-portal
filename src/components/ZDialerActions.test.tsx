import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZDialerActions } from './ZDialerActions'
import { ZDialerMessageHandoff } from './ZDialerMessageHandoff'
import { requestZDialerMessage, zdialerNumber, zdialerPlatform } from '@/lib/zdialer'
const desktop = () => { vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows Chrome'); vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32') }
beforeEach(() => { desktop(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function installControls(number: string) {
  const link = screen.getByRole('link', { name: number })
  link.classList.add('zvoice-extn-ctc')
  const controls = document.createElement('span')
  controls.className = 'zvoice-extn-ctc-main'
  controls.innerHTML = '<button class="zvoice-extn-ct-pop-call">Provider call</button><button class="zvoice-extn-ct-pop-sms">Provider SMS</button>'
  link.after(controls)
  const call = vi.fn(), sms = vi.fn()
  controls.children[0].addEventListener('click', call)
  controls.children[1].addEventListener('click', sms)
  return { call, sms }
}

describe('ZDialer platform handoff', () => {
  it('uses device identity rather than window width, including iPad desktop user agents', () => {
    expect(zdialerPlatform({ userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 10 })).toBe('desktop')
    expect(zdialerPlatform({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
    expect(zdialerPlatform({ userAgent: 'Android Chrome', platform: 'Linux', maxTouchPoints: 5 })).toBe('android')
  })
  it('normalizes US, international and extension numbers without allowing arbitrary URI content', () => {
    expect(zdialerNumber('(618) 555-0100')).toBe('+16185550100')
    expect(zdialerNumber('+44 20 7946 0018')).toBe('+442079460018')
    expect(zdialerNumber('123')).toBe('123')
    for (const bad of ['+1+2345678', 'javascript:alert(1)', '123?call=other', '*123#', '442079460018']) expect(zdialerNumber(bad)).toBe('')
  })
  it('hands only to the installed extension controls and never calls the SDK/API or native desktop phone', async () => {
    const view = render(<ZDialerActions phone="6185550100" />)
    fireEvent.click(screen.getByRole('button', { name: 'Call with ZDialer' }))
    expect(screen.getByRole('status').textContent).toContain('unavailable')
    let provider!: ReturnType<typeof installControls>
    act(() => { provider = installControls('+16185550100') })
    await waitFor(() => expect(screen.getByText(/controls detected/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Call with ZDialer' }))
    expect(provider.call).toHaveBeenCalledOnce()
    expect(provider.sms).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('has not confirmed a connection')
    view.rerender(<ZDialerActions phone="4805550100" />)
    fireEvent.click(screen.getByRole('button', { name: 'Call with ZDialer' }))
    expect(provider.call).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('unavailable')
  })
  it('opens the exact SMS recipient without sending or discarding the draft', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
    render(<ZDialerActions phone="6185550100" kind="sms" draft="Review this draft" />)
    let provider!: ReturnType<typeof installControls>
    act(() => { provider = installControls('+16185550100') })
    fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }))
    await waitFor(() => expect(copy).toHaveBeenCalledWith('Review this draft'))
    fireEvent.click(screen.getByRole('button', { name: 'Open ZDialer SMS' }))
    expect(provider.sms).toHaveBeenCalledOnce()
    expect(provider.call).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('draft is retained')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['iPhone Safari', 'Android Chrome'])('requires default-app setup for mobile calling and never uses personal SMS: %s', userAgent => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    const view = render(<ZDialerActions phone="6185550100" />)
    expect(screen.queryByRole('link', { name: 'Continue to ZDialer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Call with ZDialer' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('link', { name: 'Continue to ZDialer' }).getAttribute('href')).toBe('tel:+16185550100')
    view.rerender(<ZDialerActions phone="6185550100" kind="sms" draft="Keep me" />)
    expect(document.querySelector('a[href^="sms:"],a[href^="tel:"],a[href^="zohovoice:"]')).toBeNull()
    expect(screen.getByText(/switch to ZDialer/)).toBeTruthy()
  })
  it('checks saved restrictions before exposing SMS handoff controls and retains the draft on rejection', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'SMS blocked: opt out' }), { status: 409 }))
    render(<ZDialerMessageHandoff />)
    act(() => requestZDialerMessage('6185550100', 'Keep draft', 'Contact', 'account-a', 'contact-a'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('opt out'))
    expect(screen.queryByRole('button', { name: 'Open ZDialer SMS' })).toBeNull()
    expect((screen.getByLabelText('ZDialer message draft') as HTMLTextAreaElement).value).toBe('Keep draft')
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body).toEqual({ phone: '6185550100', accountId: 'account-a', contactId: 'contact-a' })
    expect(body.message).toBeUndefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
