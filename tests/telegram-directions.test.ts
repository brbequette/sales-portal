// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { telegramAgents, type TelegramBinding } from '../src/lib/telegram-policy'
import { roleIntroduction } from '../src/lib/telegram-directions'

const db = vi.hoisted(() => ({
  operationalAction: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  systemSetting: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
}))
vi.mock('../src/lib/prisma', () => ({ prisma: db }))
vi.mock('../src/lib/telegram-agent', () => ({ answerTelegram: vi.fn() }))
import { answerTelegram } from '../src/lib/telegram-agent'
import { processTelegramJob } from '../src/lib/telegram-service'

let binding: TelegramBinding
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TELEGRAM_ENABLED', 'true')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
  vi.stubEnv('TELEGRAM_BOT_USERNAME', 'TitanTestBot')
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'a'.repeat(48))
  vi.stubEnv('TELEGRAM_WORKER_SECRET', 'b'.repeat(48))
  vi.stubEnv('TELEGRAM_PUBLIC_ORIGIN', 'https://portal.example.com')
  binding = { userId: 'user-1', telegramId: '123', chatId: '123', nonce: 'nonce', agent: 'sales' }
  db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' })
  db.operationalAction.updateMany.mockResolvedValue({ count: 1 })
  db.systemSetting.findUnique.mockImplementation(async () => ({ key: 'telegram:user:123', value: JSON.stringify(binding) }))
  db.systemSetting.updateMany.mockImplementation(async ({ data }) => { binding = JSON.parse(data.value); return { count: 1 } })
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 1234 } }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

async function command(text: string) {
  db.operationalAction.findUniqueOrThrow.mockResolvedValue({ id: 'job-1', actorId: binding.userId, createdAt: new Date(), payload: { ...binding, text } })
  await processTelegramJob('job-1')
  return fetchMock.mock.calls.length ? JSON.parse(fetchMock.mock.calls[0][1].body).text as string : ''
}

describe('persistent role directions and Telegram command delivery', () => {
  it.each(telegramAgents)('selects %s and delivers its complete directions without a model call', async agent => {
    const text = await command(`/${agent}`)
    expect(binding.agent).toBe(agent)
    expect(text).toBe(roleIntroduction(agent))
    expect(text.length).toBeLessThan(3500)
    expect(text).toContain('Workflow:')
    expect(text).toContain('Example request:')
    expect(answerTelegram).not.toHaveBeenCalled()
    expect(db.operationalAction.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }))
  })
  it.each(['/directions', '/instructions'])('repeats the selected role for %s', async request => {
    binding.agent = 'graphics'
    expect(await command(request)).toBe(roleIntroduction('graphics'))
    expect(db.systemSetting.updateMany).not.toHaveBeenCalled()
    expect(answerTelegram).not.toHaveBeenCalled()
  })
  it('does not expose a restricted role after access changes', async () => {
    binding.agent = 'accounting'
    db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'AGENT' })
    expect(await command('/directions')).toContain('unavailable for your current portal access')
    expect(answerTelegram).not.toHaveBeenCalled()
  })
  it('lists the new roles in help while retaining accounting restrictions', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'AGENT' })
    const text = await command('/help')
    for (const role of ['data', 'zoho', 'billing']) expect(text).toContain(`/${role}`)
    expect(text).not.toContain('/accounting')
    expect(text).toContain('/directions')
  })
})
