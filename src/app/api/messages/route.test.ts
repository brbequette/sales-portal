// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ session: vi.fn(), accounts: vi.fn(), sql: vi.fn(), campaign: vi.fn(), logs: vi.fn(), replies: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findMany: m.accounts }, $queryRaw: m.sql, campaignBlast: { findUnique: m.campaign }, campaignLog: { findMany: m.logs }, smsMessage: { findMany: m.replies } } }))
import { GET } from './route'
const sent = new Date('2026-10-08T12:00:00Z')
const reply = { id: 'reply', accountId: 'a', body: 'Please call me', direction: 'INBOUND', createdAt: new Date('2026-10-08T13:00:00Z') }
const log = (id: string, status = 'SUCCESS') => ({ status, sentAt: sent, account: { id, name: id, smsMessages: [{ id: 'followup', direction: 'OUTBOUND', createdAt: new Date('2026-10-08T14:00:00Z') }] } })
beforeEach(() => { vi.clearAllMocks(); m.session.mockResolvedValue({ user: { id: 'rep', role: 'AGENT' } }); m.accounts.mockResolvedValue([]); m.sql.mockResolvedValue([{ id: 'a' }]); m.campaign.mockResolvedValue({ authorId: 'rep' }); m.logs.mockResolvedValue([log('a')]); m.replies.mockResolvedValue([reply]) })
it('denies anonymous reads', async () => { m.session.mockResolvedValue(null); expect((await GET(new Request('https://t.test/api/messages?incomingOnly=true'))).status).toBe(401); expect(m.accounts).not.toHaveBeenCalled() })
it('filters incoming messages on the server before limiting and retains owner scope', async () => {
  await GET(new Request('https://t.test/api/messages?incomingOnly=true'))
  const query = m.accounts.mock.calls[0][0]
  expect(query.where).toEqual({ id: { in: ['a'] }, ownerId: 'rep', smsMessages: { some: { direction: 'INBOUND' } } })
  expect(query.select.smsMessages.where).toEqual({ direction: 'INBOUND' })
  expect(m.sql.mock.calls[0][0].values).toContain('rep')
  expect(m.sql.mock.calls[0][0].values).toContain(true)
})
it('keeps campaign replies after an outbound follow-up and previews the received message', async () => {
  const data = await (await GET(new Request('https://t.test/api/messages?campaignBlastId=c&incomingOnly=true'))).json()
  expect(data.accounts[0].hasReplied).toBe(true)
  expect(data.accounts[0].smsMessages[0].id).toBe('reply')
  expect(m.logs.mock.calls[0][0].where.account).toEqual({ ownerId: 'rep' })
})
it('excludes pre-campaign inbound messages and failed-only sends', async () => {
  m.logs.mockResolvedValue([log('a'), log('b', 'FAILED')])
  m.replies.mockResolvedValue([{ ...reply, createdAt: new Date('2026-10-08T11:00:00Z') }])
  const data = await (await GET(new Request('https://t.test/api/messages?campaignBlastId=c&incomingOnly=true'))).json()
  expect(data.accounts).toEqual([])
  expect(m.replies.mock.calls[0][0].where.accountId.in).toEqual(['a'])
})
it('deduplicates campaign recipients and retains reply status in all-messages view', async () => {
  m.logs.mockResolvedValue([log('a'), log('a')])
  const data = await (await GET(new Request('https://t.test/api/messages?campaignBlastId=c'))).json()
  expect(data.accounts).toHaveLength(1)
  expect(data.accounts[0].hasReplied).toBe(true)
  expect(data.accounts[0].smsMessages[0].id).toBe('followup')
})
it('denies access to another representative’s campaign', async () => {
  m.campaign.mockResolvedValue({ authorId: 'other' })
  expect((await GET(new Request('https://t.test/api/messages?campaignBlastId=c&incomingOnly=true'))).status).toBe(404)
  expect(m.logs).not.toHaveBeenCalled()
})
