// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, systemSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  operationalAction: { groupBy: vi.fn(), count: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
  callLog: { groupBy: vi.fn(), findMany: vi.fn() }, smsMessage: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  communicationEvent: { groupBy: vi.fn() }, task: { count: vi.fn(), findMany: vi.fn() },
}))
vi.mock('../src/lib/prisma', () => ({ prisma: db }))
import { configureMonitor, enqueueMonitorReports, monitorDelivery, monitorStillEnabled, readInteractionReview } from '../src/lib/telegram-monitor'
import type { TelegramBinding } from '../src/lib/telegram-policy'

const binding: TelegramBinding = { userId: 'admin-1', telegramId: '123', chatId: '123', nonce: 'nonce-current', agent: 'system' }
const admin = { id: binding.userId, role: 'ADMIN' }
const setting = { key: `telegram:monitor:${binding.userId}`, value: JSON.stringify({ ...binding, mode: 'daily' }) }
beforeEach(() => {
  vi.clearAllMocks()
  db.user.findUnique.mockResolvedValue(admin)
  db.systemSetting.findMany.mockResolvedValue([setting])
  db.systemSetting.findUnique.mockImplementation(async ({ where }) => where.key.startsWith('telegram:monitor:') ? setting : { value: JSON.stringify(binding) })
  for (const model of [db.callLog, db.smsMessage, db.communicationEvent, db.operationalAction]) model.groupBy.mockResolvedValue([])
  for (const model of [db.callLog, db.smsMessage, db.task]) model.findMany.mockResolvedValue([])
  db.operationalAction.count.mockResolvedValue(0)
  db.smsMessage.count.mockResolvedValue(0)
  db.task.count.mockResolvedValue(0)
  db.operationalAction.upsert.mockResolvedValue({ id: 'review-1' })
  db.operationalAction.updateMany.mockResolvedValue({ count: 1 })
  db.operationalAction.createMany.mockResolvedValue({ count: 1 })
})

describe('administrator monitoring schedule', () => {
  it('sends daily at 8 AM Phoenix and retains urgent alerts after the daily digest', () => {
    expect(monitorDelivery('daily', new Date('2026-09-27T14:59:00Z'), false)).toEqual([])
    expect(monitorDelivery('daily', new Date('2026-09-27T15:00:00Z'), false)).toEqual(['daily:2026-09-27'])
    expect(monitorDelivery('daily', new Date('2026-09-27T17:00:00Z'), true)).toEqual(expect.arrayContaining(['daily:2026-09-27', expect.stringMatching(/^alert:/)]))
    expect(monitorDelivery('alerts', new Date(), false)).toEqual([])
  })
  it('requires a strict administrator before enabling or reading interaction review', async () => {
    db.user.findUnique.mockResolvedValue({ ...admin, role: 'MANAGER' })
    expect(await configureMonitor(binding, 'daily')).toContain('Administrator access is required')
    expect(db.systemSetting.upsert).not.toHaveBeenCalled()
    expect(await readInteractionReview({ ...admin, role: 'AGENT' })).toHaveProperty('error')
    expect(db.callLog.groupBy).not.toHaveBeenCalled()
  })
  it('saves the exact pairing for enabled monitoring and stops future delivery when disabled', async () => {
    expect(await configureMonitor(binding, 'daily')).toContain('monitoring enabled: daily')
    expect(JSON.parse(db.systemSetting.upsert.mock.calls[0][0].create.value)).toMatchObject({ nonce: binding.nonce, chatId: binding.chatId, mode: 'daily' })
    await configureMonitor(binding, 'off')
    expect(db.systemSetting.deleteMany).toHaveBeenCalledWith({ where: { key: setting.key } })
    db.systemSetting.findUnique.mockResolvedValue(null)
    expect(await monitorStillEnabled(binding)).toBe(false)
  })
  it('does not reuse a check already claimed by another invocation', async () => {
    db.operationalAction.updateMany.mockResolvedValue({ count: 0 })
    await enqueueMonitorReports(new Date('2026-09-27T15:00:00Z'))
    expect(db.callLog.groupBy).not.toHaveBeenCalled()
    expect(db.operationalAction.createMany).not.toHaveBeenCalled()
  })
  it('uses stable digest keys and queues at most one report when digest includes an alert', async () => {
    db.operationalAction.count.mockResolvedValue(3)
    await enqueueMonitorReports(new Date('2026-09-27T15:00:00Z'))
    expect(db.operationalAction.createMany).toHaveBeenCalledTimes(1)
    const request = db.operationalAction.createMany.mock.calls[0][0]
    expect(request.skipDuplicates).toBe(true)
    expect(request.data[0].idempotencyKey).toBe('telegram-monitor-report:admin-1:nonce-current:daily:2026-09-27')
    expect(request.data[0].payload).toMatchObject({ monitor: true, nonce: binding.nonce, chatId: binding.chatId })
  })
  it('can queue a later urgent report when the daily digest key already exists', async () => {
    db.operationalAction.count.mockResolvedValue(3)
    db.operationalAction.createMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    await enqueueMonitorReports(new Date('2026-09-27T17:00:00Z'))
    expect(db.operationalAction.createMany).toHaveBeenCalledTimes(2)
    expect(db.operationalAction.createMany.mock.calls[1][0].data[0].idempotencyKey).toContain(':alert:')
  })
  it('suppresses work for a stale pairing or revoked administrator role', async () => {
    db.systemSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ ...binding, nonce: 'changed' }) })
    await enqueueMonitorReports()
    expect(db.operationalAction.upsert).not.toHaveBeenCalled()
    db.user.findUnique.mockResolvedValue({ ...admin, role: 'AGENT' })
    await enqueueMonitorReports()
    expect(db.operationalAction.upsert).not.toHaveBeenCalled()
  })
  it('reports bounded content coverage and excludes raw operational payloads and error messages', async () => {
    db.callLog.findMany.mockResolvedValue([{ id: 'call', transcript: 'x'.repeat(3000) }])
    const result = await readInteractionReview(admin, new Date('2026-09-27T15:00:00Z'))
    expect(result).toHaveProperty('samples.calls.0.truncated', true)
    expect(result).toHaveProperty('coverage', expect.stringContaining('not every conversation'))
    expect(db.operationalAction.groupBy.mock.calls[0][0]).toMatchObject({ by: ['actionType', 'status'] })
    expect(JSON.stringify(db.operationalAction.groupBy.mock.calls[0][0])).not.toMatch(/payload|errorMessage/)
  })
})
