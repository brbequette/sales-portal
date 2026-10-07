import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const user = { id: 'u', email: 'rep@example.com', role: 'AGENT' }
vi.mock('@/components/ZohoProvider', () => ({ useZoho: () => ({ zohoContext: user }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }))
vi.mock('@/components/PhoneLink', () => ({ PhoneLink: ({ children }: any) => <span>{children}</span> }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import TasksPage from './page'
import { toast } from 'react-hot-toast'
const rows = [
  { id: '1', zohoId: 'voice_callback_1', title: 'Call customer', type: 'Call', status: 'Not Started', priority: 'High', dueDate: new Date().toISOString(), ownerId: 'u' },
  { id: '2', zohoId: 'AUTO:ACTION:2', title: 'Prepare order', type: 'Processing', status: 'Not Started', priority: 'Normal', dueDate: new Date().toISOString(), ownerId: 'u' },
]
describe('Task Hub interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('outcomes') ? { outcomes: [] } : { success: true, tasks: rows } })))
  })
  afterEach(cleanup)
  it('keeps category counts independent and applies search to calendar', async () => {
    render(<TasksPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comms (1)' }))
    expect(screen.getByRole('button', { name: 'Process (1)' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Prepare order' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Search tasks' }))
    fireEvent.change(screen.getByPlaceholderText('Search tasks, accounts...'), { target: { value: 'unmatched' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }))
    expect(screen.queryByText('Call customer')).toBeNull()
    expect(screen.queryByText('Prepare order')).toBeNull()
  })
  it('shows load failures and allows a successful retry instead of false empty state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Connection unavailable' }) } as any)
    render(<TasksPage />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('All caught up!')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Call customer' })).toBeTruthy()
  })
  it('preserves a task when the provider rejects completion', async () => {
    render(<TasksPage />)
    await screen.findByRole('heading', { name: 'Call customer' })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Zoho unavailable', error: { code: 'LIMIT' } }) } as any)
    fireEvent.click(screen.getAllByRole('button', { name: 'Complete' })[0])
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Zoho unavailable'))
    expect(screen.getByRole('heading', { name: 'Call customer' })).toBeTruthy()
  })
  it('opens detail by keyboard and keeps a successful completion selected when saving', async () => {
    render(<TasksPage />)
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Open task: Call customer' }), { key: 'Enter' })
    await screen.findByRole('dialog', { name: 'Task details' })
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark Complete' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).status).toBe('Completed'))
  })
})
