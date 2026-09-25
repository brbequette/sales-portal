import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ account: { findFirst: vi.fn(), findMany: vi.fn() }, callLog: { findMany: vi.fn(), count: vi.fn() }, task: { findMany: vi.fn() }, invoice: { findMany: vi.fn() }, product: { findMany: vi.fn() } }))
vi.mock('./prisma', () => ({ prisma: db }))
vi.mock('./ai-client', () => ({ createAIChatCompletion: vi.fn() }))
import { executeTelegramRead } from './telegram-agent'

describe('Telegram tools enforce record access before retrieval', () => {
  const rep = { id: 'rep-a', role: 'AGENT', name: 'Rep' }
  beforeEach(() => vi.clearAllMocks())
  it('does not retrieve transcripts for an account outside the signed-in rep scope', async () => {
    db.account.findFirst.mockResolvedValue(null)
    const result = await executeTelegramRead('read_account_calls', { accountId: 'someone-elses-account', userId: 'admin' }, rep)
    expect(result).toHaveProperty('error')
    expect(db.account.findFirst.mock.calls[0][0].where.ownerId).toBe('rep-a')
    expect(db.callLog.findMany).not.toHaveBeenCalled()
  })
  it('does not expose accounting tools or arbitrary write tools to a rep', async () => {
    expect(await executeTelegramRead('read_invoice_calculations', {}, rep)).toHaveProperty('error')
    expect(await executeTelegramRead('send_campaign', {}, rep)).toHaveProperty('error')
    expect(db.invoice.findMany).not.toHaveBeenCalled()
  })
  it('scopes collections to the rep account owner regardless of supplied scope', async () => {
    db.invoice.findMany.mockResolvedValue([])
    await executeTelegramRead('read_overdue_invoices', { ownerId: 'admin' }, rep)
    expect(db.invoice.findMany.mock.calls[0][0].where.account).toEqual({ ownerId: 'rep-a' })
    expect(db.invoice.findMany.mock.calls[0][0].where.isWrittenOff).toBe(false)
  })
})
