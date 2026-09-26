import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, account: { findFirst: vi.fn(), findMany: vi.fn() }, callLog: { findMany: vi.fn(), count: vi.fn() }, task: { findMany: vi.fn() }, invoice: { findMany: vi.fn() }, product: { findMany: vi.fn() } }))
vi.mock('./prisma', () => ({ prisma: db }))
vi.mock('./ai-client', () => ({ createAIChatCompletion: vi.fn() }))
import { answerTelegram, executeTelegramRead } from './telegram-agent'
import { createAIChatCompletion } from './ai-client'
import { telegramAgents } from './telegram-policy'
import { roleInstructions } from './telegram-directions'

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

describe('role instructions reach drafting and final response validation', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each(telegramAgents)('uses %s directions for both model passes and permits a focused clarification', async agent => {
    db.user.findUnique.mockResolvedValue({ id: 'admin', role: 'ADMIN', name: 'Admin' })
    const completion = { response: { choices: [{ message: { content: 'Which company should I review?' } }] } }
    vi.mocked(createAIChatCompletion).mockResolvedValue(completion as never)
    const binding = { userId: 'admin', telegramId: '123', chatId: '123', nonce: 'nonce', agent }
    expect(await answerTelegram('admin', agent, 'Help me get started', binding, 'job-1')).toBe('Which company should I review?')
    const calls = vi.mocked(createAIChatCompletion).mock.calls
    expect(calls).toHaveLength(2)
    for (const [request] of calls) expect(request.messages[0].content).toContain(roleInstructions(agent))
    expect(calls[0][0].tool_choice).toBe('auto')
    expect(calls[1][0].messages[0].content).toContain('never a critique or discussion of the draft')
    const names = calls[0][0].tools!.map(tool => tool.type === 'function' ? tool.function.name : '')
    if (agent !== 'accounting') expect(names).not.toContain('read_invoice_calculations')
    expect(names).not.toContain('send_campaign')
    expect(names).not.toContain('execute_sql')
  })
})
