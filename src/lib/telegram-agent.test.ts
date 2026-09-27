import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ operationalAction: { findMany: vi.fn(), groupBy: vi.fn() }, user: { findUnique: vi.fn() }, account: { findFirst: vi.fn(), findMany: vi.fn() }, callLog: { findMany: vi.fn(), count: vi.fn() }, task: { findMany: vi.fn() }, invoice: { findMany: vi.fn() }, product: { findMany: vi.fn() } }))
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
    db.operationalAction.findMany.mockResolvedValue([])
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
    if (!['accounting', 'system'].includes(agent)) expect(names).not.toContain('read_invoice_calculations')
    expect(names).not.toContain('send_campaign')
    expect(names).not.toContain('execute_sql')
  })
})

describe('system assistant status boundaries', () => {
  beforeEach(() => vi.clearAllMocks())
  it('denies runtime status to a rep without querying job data', async () => {
    expect(await executeTelegramRead('read_system_status', {}, { id: 'rep', role: 'AGENT', name: 'Rep' })).toHaveProperty('error')
    expect(db.operationalAction.groupBy).not.toHaveBeenCalled()
  })
  it('returns booleans and requester-scoped counts, never secret values', async () => {
    const original = process.env.TELEGRAM_BOT_TOKEN
    process.env.TELEGRAM_BOT_TOKEN = 'secret-value-not-for-output'
    try {
      db.operationalAction.groupBy.mockResolvedValue([{ status: 'PENDING', _count: { _all: 2 } }])
      const status = await executeTelegramRead('read_system_status', { actorId: 'someone-else' }, { id: 'admin', role: 'ADMIN', name: 'Admin' })
      expect(JSON.stringify(status)).not.toContain('secret-value-not-for-output')
      expect(status).toHaveProperty('configurationPresent.telegramBotToken', true)
      expect(db.operationalAction.groupBy.mock.calls[0][0].where.actorId).toBe('admin')
      expect(status).toHaveProperty('telegramJobs', [{ status: 'PENDING', count: 2 }])
    } finally { if (original === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = original }
  })
  it('does not give management tools to a system-chat rep and reloads context inside their scope', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'rep', role: 'AGENT', name: 'Rep' })
    db.operationalAction.findMany.mockResolvedValue([])
    vi.mocked(createAIChatCompletion).mockResolvedValue({ response: { choices: [{ message: { content: 'Which company?' } }] } } as never)
    await answerTelegram('rep', 'system', 'What about the balance?', { userId: 'rep', telegramId: '123', chatId: '123', nonce: 'new', agent: 'system' }, 'job-new')
    const request = vi.mocked(createAIChatCompletion).mock.calls[0][0]
    expect(request.tools!.some(t => t.type === 'function' && ['read_invoice_calculations', 'read_system_status'].includes(t.function.name))).toBe(false)
    expect(db.operationalAction.findMany.mock.calls[0][0]).toMatchObject({ where: { actorId: 'rep', entityId: '123', status: 'SUCCEEDED', id: { not: 'job-new' } }, take: 6 })
  })
})
