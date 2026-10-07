import { describe, expect, it, vi } from 'vitest'
import { completionId, parseTaskCompletion, saveTaskCompletion } from './task-completion'

const input = { requestId: 'request-1234567890', summary: 'Customer confirmed the order', outcomeType: 'WON', nextAction: 'Confirm delivery', followUpAt: '2099-10-10T12:00:00Z' }
const task = { id: 'task1', subject: 'Call customer', ownerId: 'rep1', accountId: 'account1', dealId: 'deal1', type: 'Call', invoiceId: 'invoice1' }
function fixture() {
  const tx = { task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({ id: 'next1' }) },
    taskOutcome: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => data) },
    operationalEvent: { create: vi.fn().mockResolvedValue({ id: 'event1' }) } }
  const db = { $transaction: vi.fn((fn: any) => fn(tx)) }
  return { db, tx }
}
describe('completion and next-step workflow', () => {
  it('saves completion, outcome, inherited follow-up and event in one transaction', async () => {
    const { db, tx } = fixture()
    await saveTaskCompletion(db as any, task, { priority: 'High' }, input, { id: 'rep1' })
    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { id: 'task1', status: { not: 'Completed' } }, data: { priority: 'High', status: 'Completed' } })
    expect(tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerId: 'rep1', accountId: 'account1', dealId: 'deal1', invoiceId: 'invoice1', subject: 'Confirm delivery', status: 'Not Started', dueDateIsDateOnly: false }) })
    expect(tx.taskOutcome.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcomeType: 'WON', documentId: 'invoice1', summary: input.summary }) })
    expect(tx.operationalEvent.create).toHaveBeenCalledOnce()
  })
  it('returns the same receipt on retry without another next step', async () => {
    const { db, tx } = fixture()
    tx.taskOutcome.findUnique.mockResolvedValue({ id: completionId(task.id, input.requestId) } as any)
    expect((await saveTaskCompletion(db as any, task, {}, input, { id: 'rep1' })).repeated).toBe(true)
    expect(tx.task.create).not.toHaveBeenCalled()
    expect(tx.task.updateMany).not.toHaveBeenCalled()
  })
  it('rejects a concurrent or already-completed task without duplicate outcomes', async () => {
    const { db, tx } = fixture(); tx.task.updateMany.mockResolvedValue({ count: 0 })
    await expect(saveTaskCompletion(db as any, task, {}, input, { id: 'rep1' })).rejects.toThrow('already completed')
    expect(tx.taskOutcome.create).not.toHaveBeenCalled()
    expect(tx.task.create).not.toHaveBeenCalled()
  })
  it('does not create a next step when the user chooses completion only', async () => {
    const { db, tx } = fixture()
    await saveTaskCompletion(db as any, task, {}, { ...input, nextAction: '', followUpAt: '' }, { id: 'rep1' })
    expect(tx.task.create).not.toHaveBeenCalled()
  })
  it.each([{ summary: '' }, { outcomeType: 'INVALID' }, { requestId: 'short' }, { nextAction: '' }, { followUpAt: '2000-01-01' }, { followUpAt: 'invalid' }])('rejects invalid completion fields %j', override => {
    expect(() => parseTaskCompletion({ ...input, ...override })).toThrow()
  })
})
