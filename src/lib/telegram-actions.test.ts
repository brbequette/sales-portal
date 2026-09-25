import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), operationalAction: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() }, systemSetting: { findUnique: vi.fn() },
  account: { findFirst: vi.fn() }, task: { create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
}))
vi.mock('./prisma', () => ({ prisma: db }))
import { approveTelegramAction } from './telegram-actions'
import type { TelegramBinding } from './telegram-policy'
const binding: TelegramBinding = { userId: 'rep-a', telegramId: '123', chatId: '123', nonce: 'pair-1', agent: 'sales' }
const proposal = () => ({ action: 'create_task', agent: 'sales', userId: 'rep-a', nonce: 'pair-1', expiresAt: Date.now() + 60000, args: { accountId: 'account-a', subject: 'Follow up', dueDate: '2026-10-01T12:00:00.000Z', description: '' } })
describe('Telegram approval execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation(fn => fn(db))
    db.user.findUnique.mockResolvedValue({ id: 'rep-a', role: 'AGENT' })
    db.systemSetting.findUnique.mockResolvedValue({ value: JSON.stringify(binding) })
    db.operationalAction.updateMany.mockResolvedValue({ count: 1 })
    db.operationalAction.update.mockResolvedValue({})
    db.operationalAction.findUnique.mockResolvedValue({ id: 'action-1', actorId: 'rep-a', status: 'AWAITING_APPROVAL', payload: proposal() })
  })
  it('refuses another user action and does not write a task', async () => {
    db.operationalAction.findUnique.mockResolvedValue({ actorId: 'rep-b', payload: { ...proposal(), userId: 'rep-b' } })
    await expect(approveTelegramAction(binding, 'action-1')).rejects.toThrow('ACTION_ACCESS_DENIED')
    expect(db.task.create).not.toHaveBeenCalled()
  })
  it('refuses an expired approval or a revoked pairing', async () => {
    db.operationalAction.findUnique.mockResolvedValue({ actorId: 'rep-a', status: 'AWAITING_APPROVAL', payload: { ...proposal(), expiresAt: 0 } })
    await expect(approveTelegramAction(binding, 'action-1')).rejects.toThrow('ACTION_EXPIRED')
    db.systemSetting.findUnique.mockResolvedValue(null)
    await expect(approveTelegramAction(binding, 'action-1')).rejects.toThrow('ACTION_ACCESS_DENIED')
    expect(db.task.create).not.toHaveBeenCalled()
  })
  it('does not execute a completed action again', async () => {
    db.operationalAction.findUnique.mockResolvedValue({ actorId: 'rep-a', status: 'SUCCEEDED', payload: proposal() })
    expect((await approveTelegramAction(binding, 'action-1')).message).toContain('not run again')
    expect(db.task.create).not.toHaveBeenCalled()
  })
  it('rechecks account ownership and verifies the written task', async () => {
    db.account.findFirst.mockResolvedValue({ id: 'account-a' })
    const task = { id: 'task-1', ownerId: 'rep-a', accountId: 'account-a', subject: 'Follow up', description: '', dueDate: new Date('2026-10-01T12:00:00.000Z') }
    db.task.create.mockResolvedValue(task); db.task.findUniqueOrThrow.mockResolvedValue(task)
    expect((await approveTelegramAction(binding, 'action-1')).message).toContain('Created and verified')
    expect(db.account.findFirst.mock.calls[0][0].where.ownerId).toBe('rep-a')
    expect(db.operationalAction.update.mock.calls[0][0].data.result.verified).toBe(true)
  })
  it('refuses automatic completion even if a caller bypasses the proposal tool', async () => {
    db.operationalAction.findUnique.mockResolvedValue({ actorId: 'rep-a', status: 'AWAITING_APPROVAL', payload: { ...proposal(), action: 'complete_task' } })
    await expect(approveTelegramAction(binding, 'action-1', true)).rejects.toThrow('AUTO_ACTION_NOT_ALLOWED')
    expect(db.task.updateMany).not.toHaveBeenCalled()
  })
  it('rechecks the automatic-approval opt-in at the executor boundary', async () => {
    db.systemSetting.findUnique.mockImplementation(({ where }) => Promise.resolve({ value: where.key.startsWith('telegram:auto:') ? 'disabled' : JSON.stringify(binding) }))
    db.operationalAction.findMany.mockResolvedValue(Array.from({ length: 50 }, () => ({ status: 'SUCCEEDED', result: { verified: true, reviewedCorrect: true } })))
    await expect(approveTelegramAction(binding, 'action-1', true)).rejects.toThrow('AUTO_READINESS_NOT_MET')
    expect(db.task.create).not.toHaveBeenCalled()
  })
})
