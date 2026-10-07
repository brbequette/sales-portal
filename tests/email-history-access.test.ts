// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ auth: vi.fn(), account: { findMany: vi.fn(), findFirst: vi.fn() }, email: { findMany: vi.fn(), findFirst: vi.fn() } }))
vi.mock('@/lib/session-user', () => ({ getAuthenticatedDbUser: m.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { email: m.email, account: m.account } }))
vi.mock('../netlify/functions/email-send', () => ({ handler: vi.fn() }))
import { GET } from '../src/app/api/emails/route'
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { id: 'rep', role: 'AGENT' } }); m.account.findMany.mockResolvedValue([{ id: 'owned' }]); m.email.findMany.mockResolvedValue([]); m.email.findFirst.mockResolvedValue({ id: 'cursor' }) })
it('scopes inbox searches to owned accounts and assigned personal email', async () => {
  const res = await GET(new NextRequest('https://www.tdusales.com/api/emails?q=blade'))
  expect(res.status).toBe(200)
  expect(m.email.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ accountId: { in: ['owned'] } }, { userId: 'rep' }], AND: [{ OR: expect.any(Array) }] })
  expect(res.headers.get('cache-control')).toBe('private, no-store')
})
it('filters the inbox before pagination while retaining mailbox authorization', async () => {
  const res = await GET(new NextRequest('https://www.tdusales.com/api/emails?folder=inbox'))
  expect(res.status).toBe(200)
  expect(m.email.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ accountId: { in: ['owned'] } }, { userId: 'rep' }], direction: 'INBOUND', status: { not: 'ARCHIVED' } })
})
it('rejects account history for another rep before reading emails', async () => {
  m.account.findFirst.mockResolvedValue({ id: 'other', ownerId: 'someone' })
  expect((await GET(new NextRequest('https://www.tdusales.com/api/emails?accountId=other'))).status).toBe(403)
  expect(m.email.findMany).not.toHaveBeenCalled()
})
it('checks cursor access and never leaks another mailbox position', async () => {
  m.email.findFirst.mockResolvedValue(null)
  expect((await GET(new NextRequest('https://www.tdusales.com/api/emails?cursor=private'))).status).toBe(400)
  expect(m.email.findMany).not.toHaveBeenCalled()
})
it('returns an older-page cursor without exposing internal operational records', async () => {
  m.email.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: String(i), operationalEvents: [{ id: 'event' }], direction: 'INBOUND', status: 'RECEIVED' })))
  const payload = await (await GET(new NextRequest('https://www.tdusales.com/api/emails'))).json()
  expect(payload.emails).toHaveLength(50); expect(payload.nextCursor).toBe('49'); expect(payload.emails[0].operationalEvents).toBeUndefined(); expect(payload.emails[0].intelligenceNeedsResponse).toBe(true)
})
