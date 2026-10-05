import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PhoneLink } from './PhoneLink'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each(['phone', 'sms'] as const)('opens the internal %s tool with the exact account and contact, without a native link', type => {
  const listener = vi.fn()
  const event = type === 'sms' ? 'titan:open-messages' : 'inAppDial'
  window.addEventListener(event, listener)
  const { container } = render(<PhoneLink phone="(480) 555-0100" type={type} accountId="account-a" contactId="contact-b" />)
  fireEvent.click(screen.getByRole('button'))
  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener.mock.calls[0][0].detail).toMatchObject({ phone: '4805550100', accountId: 'account-a', contactId: 'contact-b' })
  expect(container.querySelector('a')).toBeNull()
  window.removeEventListener(event, listener)
})
