// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ event: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, account: { findUnique: vi.fn() }, user: { findUnique: vi.fn() }, task: { upsert: vi.fn() } }))
vi.mock('../src/lib/prisma', () => ({ prisma: { $transaction: (fn: any) => fn({ emailOperationalEvent: m.event, account: m.account, user: m.user, task: m.task }) } }))
import { reviewEmailEvent } from '../src/lib/email-intelligence-review'
const revision = '2026-10-05T12:00:00.000Z'
const input = { id: 'e', actorId: 'admin', expectedUpdatedAt: revision, action: 'CREATE_TASK' }
beforeEach(() => {
  vi.clearAllMocks()
  m.event.findUnique.mockResolvedValue({ id: 'e', updatedAt: new Date(revision), status: 'APPROVED', accountId: 'a', conflictReason: null, summary: 'Confirm blade specifications', extractedData: {}, email: { subject: 'Quote question', fromAddress: 'buyer@example.com', mailboxAddress: 'sales@example.com' } })
  m.event.updateMany.mockResolvedValue({ count: 1 }); m.event.update.mockResolvedValue({})
  m.account.findUnique.mockResolvedValue({ id: 'a', ownerId: 'rep' }); m.user.findUnique.mockResolvedValue({ id: 'rep' }); m.task.upsert.mockResolvedValue({ id: 'task-1' })
})
it('creates only a single stable follow-up identity after approval', async () => {
  expect(await reviewEmailEvent(input)).toEqual({ status: 'APPLIED', taskId: 'task-1' })
  expect(m.task.upsert.mock.calls[0][0]).toMatchObject({ where: { zohoId: 'email_intelligence_e' }, update: {}, create: { accountId: 'a', ownerId: 'rep', status: 'Not Started' } })
})
it('rejects a stale review before any mutation', async () => {
  await expect(reviewEmailEvent({ ...input, expectedUpdatedAt: 'old' })).rejects.toThrow('changed')
  expect(m.event.updateMany).not.toHaveBeenCalled(); expect(m.task.upsert).not.toHaveBeenCalled()
})
it('cannot create tasks for unapproved evidence', async () => {
  m.event.findUnique.mockResolvedValue({ ...(await m.event.findUnique()), status: 'REVIEW_REQUIRED' })
  await expect(reviewEmailEvent(input)).rejects.toThrow('Approve'); expect(m.task.upsert).not.toHaveBeenCalled()
})
it('stops a concurrent reviewer before creating a second task', async () => {
  m.event.updateMany.mockResolvedValue({ count: 0 }); await expect(reviewEmailEvent(input)).rejects.toThrow('changed'); expect(m.task.upsert).not.toHaveBeenCalled()
})
it('requires resolved account and valid owner', async () => {
  m.event.findUnique.mockResolvedValue({ ...(await m.event.findUnique()), conflictReason: 'ambiguous' })
  await expect(reviewEmailEvent(input)).rejects.toThrow('Resolve'); expect(m.task.upsert).not.toHaveBeenCalled()
})
it('keeps completed evidence terminal', async () => {
  m.event.findUnique.mockResolvedValue({ ...(await m.event.findUnique()), status: 'APPLIED' })
  await expect(reviewEmailEvent({ ...input, action: 'REOPEN' })).rejects.toThrow('already'); expect(m.event.updateMany).not.toHaveBeenCalled()
})
it('manual linking clears suspect document links and requires another review', async () => {
  await reviewEmailEvent({ ...input, action: 'LINK_ACCOUNT', accountId: 'b' })
  expect(m.event.updateMany.mock.calls[0][0].data).toMatchObject({ accountId: 'b', invoiceId: null, salesOrderId: null, status: 'REVIEW_REQUIRED', matchMethod: 'MANUAL_REVIEW' })
  expect(m.task.upsert).not.toHaveBeenCalled()
})
it('approval alone does not create a task or apply financial changes', async () => {
  await reviewEmailEvent({ ...input, action: 'APPROVE' }); expect(m.task.upsert).not.toHaveBeenCalled()
})
