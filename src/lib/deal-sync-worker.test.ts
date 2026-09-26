import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ priorities: [] as boolean[], calls: 0, fail: false }))
vi.mock('./prisma', () => ({ prisma: {
  $executeRaw: vi.fn(async () => 1),
  $queryRaw: vi.fn(async (_sql: TemplateStringsArray, priority: boolean) => {
    state.priorities.push(priority)
    return [{ invoiceId: `invoice-${++state.calls}`, revision: '2026-09-25T00:00:00Z', lease: '2026-09-26T00:00:00Z' }]
  }),
} }))
vi.mock('./deal-crm-sync', () => ({
  getDealSyncConfig: async () => ({ enabled: true }), crmMetadata: async () => ({}), validateDealSyncConfig: () => {},
  syncDealToCrm: vi.fn(async () => { if (state.fail) throw new Error('HELD') }),
}))
vi.mock('./deal-reconciliation', () => ({ reconcileInvoiceDeal: async (id: string) => `deal-${id}` }))
import { runDealSyncBatch } from './deal-sync-worker'
beforeEach(() => { state.priorities = []; state.calls = 0; state.fail = false })
describe('bounded follow-up scheduling', () => {
  it('serves oldest work first and reserves only one follow-up slot', async () => {
    const result = await runDealSyncBatch(5)
    expect(state.priorities).toEqual([false, true, false, false, false])
    expect(result.results).toHaveLength(5)
  })
  it('does not prioritize follow-ups in repeated single-job batches', async () => {
    await runDealSyncBatch(1); await runDealSyncBatch(1)
    expect(state.priorities).toEqual([false, false])
  })
  it('does not create additional priority slots when jobs fail', async () => {
    state.fail = true
    const result = await runDealSyncBatch(3)
    expect(state.priorities).toEqual([false, true, false])
    expect(result.results.every(r => r.status === 'REVIEW_REQUIRED')).toBe(true)
  })
})
