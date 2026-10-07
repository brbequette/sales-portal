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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams
      const category = params.get('category'), search = params.get('search') || ''
      const tasks = rows.filter(t => (!search || t.title.toLowerCase().includes(search)) && (!category || category === 'all' || (category === 'communication' ? t.type === 'Call' : t.type === 'Processing')))
      return { ok: true, json: async () => url.includes('outcomes') ? { outcomes: [] } : { success: true, tasks, pagination: { page: Number(params.get('page') || 1), pages: 13, pageSize: 50, total: 650 }, categoryCounts: { all: 2, communication: 1, process: 1 }, queues: { open: 650, today: 3, overdue: 8, waiting: 2, duplicates: 2 } } }
    }))
  })
  afterEach(cleanup)
  it('keeps category counts independent and applies search to calendar', async () => {
    render(<TasksPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comms (1)' }))
    expect(screen.getByRole('button', { name: 'Process (1)' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Prepare order' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Search tasks' }))
    fireEvent.change(screen.getByPlaceholderText('Search tasks, accounts...'), { target: { value: 'unmatched' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }))
    await waitFor(() => expect(screen.queryByText('Call customer')).toBeNull())
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
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Customer requested another call' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outcome & complete' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Zoho unavailable'))
    expect(screen.getByRole('heading', { name: 'Call customer' })).toBeTruthy()
  })
  it('opens detail by keyboard and keeps a successful completion selected when saving', async () => {
    render(<TasksPage />)
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Open task: Call customer' }), { key: 'Enter' })
    await screen.findByRole('dialog', { name: 'Task details' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }))
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Customer confirmed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outcome & complete' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Complete task and next step' })).toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark Complete' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(JSON.parse(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('update-task')).at(-1)![1]!.body as string).status).toBe('Completed'))
  })
  it('requests later pages and resets pagination when a queue changes', async () => {
    render(<TasksPage />)
    await screen.findByRole('heading', { name: 'Call customer' })
    fireEvent.click(screen.getByRole('button', { name: 'Next task page' }))
    await waitFor(() => expect(String(vi.mocked(fetch).mock.calls.at(-1)![0])).toContain('page=2'))
    fireEvent.click(screen.getByRole('button', { name: 'Waiting 2' }))
    await waitFor(() => {
      const url = String(vi.mocked(fetch).mock.calls.at(-1)![0])
      expect(url).toContain('page=1'); expect(url).toContain('queue=waiting')
    })
  })
})
