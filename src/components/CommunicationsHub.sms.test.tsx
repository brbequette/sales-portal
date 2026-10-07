import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'rep' } } }) }))
vi.mock('./SaleCommunications', () => ({ SaleCommunications: () => null }))
vi.mock('./AccountDialer', () => ({ AccountDialer: () => null }))
import { CommunicationsHub } from './CommunicationsHub'
let response: Record<string, unknown>
beforeEach(() => {
  response = { success: true, providerAccepted: true, smsMessage: { id: 'saved' } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/api/send-sms' ? response : { success: true, communications: [], numbers: [{ number: '+14805550100', active: true }, { number: '+14805550101', active: true }] } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function prepare() {
  render(<CommunicationsHub accountId="account-a" contacts={[{ id: 'contact-a', phone: '6185550100', isPrimary: true }]} />)
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/manage-zoho-numbers')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'SMS' }))
  await waitFor(() => expect((screen.getByLabelText('SMS sender') as HTMLSelectElement).value).toBe('+14805550100'))
  fireEvent.change(screen.getByLabelText('SMS sender'), { target: { value: '+14805550101' } })
  fireEvent.change(screen.getByPlaceholderText('Type SMS message...'), { target: { value: 'Internal message' } })
}
it('sends with the selected business number and clears only after confirmed acceptance', async () => {
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect((screen.getByPlaceholderText('Type SMS message...') as HTMLInputElement).value).toBe(''))
  const call = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/send-sms')!
  expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ accountId: 'account-a', contactId: 'contact-a', fromNumber: '+14805550101', message: 'Internal message' })
})
it('does not clear text or report success without provider acceptance', async () => {
  response = { success: true, error: 'Provider acceptance is missing' }
  await prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByText('Provider acceptance is missing')
  expect((screen.getByPlaceholderText('Type SMS message...') as HTMLInputElement).value).toBe('Internal message')
})
