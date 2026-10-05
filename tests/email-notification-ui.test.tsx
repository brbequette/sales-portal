// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { EmailSalesAssist } from '../src/components/EmailSalesAssist'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const notifications = vi.hoisted(() => ({ markAsRead: vi.fn(), notifications: [{ id: 'n', title: 'Shipping needs review', body: 'Check package dimensions.', read: false, createdAt: '2026-10-05T12:00:00Z' }] }))
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ ...notifications, unreadCount: 1, markAllAsRead: vi.fn(), requestPermission: vi.fn(), permission: 'granted' }) }))
import { NotificationCenter } from '../src/components/NotificationCenter'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
it('keeps notification panel outside clipping ancestors and allows its actions', async () => {
  const view = render(<div style={{ overflow: 'hidden', transform: 'translateX(0)' }}><NotificationCenter /></div>)
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }))
  const dialog = screen.getByRole('dialog', { name: 'Notifications' })
  expect(dialog.parentElement).toBe(document.body)
  expect(view.container.contains(dialog)).toBe(false)
  fireEvent.mouseDown(screen.getByText('Shipping needs review'))
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }))
  expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull()
})
it('does not show a late draft on a different email', async () => {
  let resolve!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r })))
  const draft = vi.fn()
  const view = render(<EmailSalesAssist emailId="one" linked onDraft={draft} />)
  fireEvent.click(screen.getByRole('button', { name: 'Suggest reply and next steps' }))
  view.rerender(<EmailSalesAssist emailId="two" linked onDraft={draft} />)
  await act(async () => { resolve(new Response(JSON.stringify({ reply: 'Old account reply', summary: 'Old message', nextSteps: [], verifyBeforeSending: [], account: { id: 'old', name: 'Old' } }), { headers: { 'content-type': 'application/json' } })) })
  expect(screen.queryByText('Old account reply')).toBeNull(); expect(draft).not.toHaveBeenCalled()
})
it('only prepares an editable draft and a task-review link', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reply: 'Confirm your blade size?', summary: 'Missing specification', nextSteps: [{ title: 'Confirm size', reason: 'Customer did not specify' }], verifyBeforeSending: [], account: { id: 'a', name: 'Customer' } }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const draft = vi.fn(); render(<EmailSalesAssist emailId="one" linked onDraft={draft} />)
  fireEvent.click(screen.getByRole('button', { name: 'Suggest reply and next steps' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review and edit reply' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Review and edit reply' }))
  expect(draft).toHaveBeenCalledWith('Confirm your blade size?')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: 'Review and schedule follow-up' }).getAttribute('href')).toContain('/tasks/new?accountId=a')
})

it('clamps the notification menu inside a narrow viewport even when the bell is on the left', () => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
  try {
    render(<NotificationCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' }).style.right).toBe('8px')
  } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }) }
})
