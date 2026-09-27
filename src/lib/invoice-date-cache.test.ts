import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: db }))
import { buildInvoiceUpdateData, updateInvoiceRecord } from './sync-engine'

describe('authoritative invoice date snapshots', () => {
  const existingItems = { date: '2026-09-01', due_date: '2026-10-21', custom: 'keep', profit: 12 }
  const financial = { status: 'draft', sub_total: 125, total: 135, balance: 135, payment_made: 0 }
  const calcItems = { profit: 40, commission: 20, deadCostTotal: 85 }
  const paymentSummary = { paymentMade: 0, paymentExpected: 135, balance: 135, lastPaymentDate: null, paymentCount: 0 }
  const conflictResult = { hasConflict: false, fields: {} }

  beforeEach(() => {
    vi.clearAllMocks()
    db.invoice.findUnique.mockResolvedValue({ items: structuredClone(existingItems) })
    db.invoice.update.mockResolvedValue({})
    db.$transaction.mockResolvedValue(undefined)
  })

  for (const path of ['builder', 'direct updater'] as const) {
    it.each([
      { date: '2026-09-15', due_date: '2026-10-15' },
      { date: undefined, due_date: undefined },
      { date: '', due_date: '' },
      { date: null, due_date: null },
    ])(`${path} keeps cached dates consistent with column semantics: %j`, async (dates) => {
      const input = { existingItems, zohoDoc: { ...financial, payment_expected: 135, ...dates }, calcItems, conflictResult, paymentSummary }
      const before = structuredClone(input)
      let data
      if (path === 'builder') data = buildInvoiceUpdateData(input)
      else {
        await updateInvoiceRecord({ localId: 'invoice-date-test', ...input })
        expect(db.invoice.update).toHaveBeenCalledTimes(1)
        data = db.invoice.update.mock.calls[0][0].data
      }
      expect(data.issueDate).toEqual(dates.date ? new Date('2026-09-15T12:00:00Z') : undefined)
      expect(data.dueDate).toEqual(dates.due_date ? new Date('2026-10-15T12:00:00Z') : null)
      expect(data.items).toEqual({
        ...existingItems, ...financial, ...calcItems,
        date: dates.date || existingItems.date, due_date: dates.due_date || null,
      })
      expect(data).toMatchObject({ amount: 125, balance: 135, paymentMade: 0, paymentExpected: 135, computedProfit: 40, computedDeadCost: 85, computedUpfront: 10, computedFinal: 0 })
      expect(input).toEqual(before)
    })
  }
})
