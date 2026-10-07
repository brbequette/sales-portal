import { expect, it } from 'vitest'
import { attributeReceipts, collectionDay, collectionPeriod, legacyCollectionCall, isLegacyCollectionCall, reportSettings, type CollectionActivity, type CollectionReceipt } from './collections-stats'
import { collectionsBonusRate, ensureCollectionsManagerLedger } from './collections-compensation'
const call: CollectionActivity = { id: 'c1', accountId: 'a', account: 'Account', actorId: 'r', actor: 'Rep', date: '2026-10-03T18:00:00Z', outcome: 'Promise to Pay', reached: true, minutes: 4, invoiceIds: ['i1', 'i2'], legacy: false }
const receipt: CollectionReceipt = { id: 'p1', accountId: 'a', account: 'Account', invoiceId: 'i1', invoice: '100', amount: 100, dueDate: '2026-09-01', date: '2026-10-05' }
it('attributes each receipt once to the latest reached contact on the exact invoice and account', () => {
  const rows = attributeReceipts([receipt, { ...receipt, id: 'p2', invoiceId: 'i2' }], [call, { ...call, id: 'c2', actorId: 'r2', date: '2026-10-04T18:00:00Z' }], 30)
  expect(rows).toHaveLength(2); expect(rows.every(r => r.collector === 'r2')).toBe(true)
  expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(200)
})
it('never credits legacy, unreached, other-invoice, same-day, future or out-of-window calls', () => {
  for (const patch of [{ legacy: true }, { reached: false }, { accountId: 'other' }, { invoiceIds: ['other'] }, { date: '2026-10-05T10:00:00Z' }, { date: '2026-10-06T10:00:00Z' }, { date: '2026-08-01T10:00:00Z' }]) {
    expect(attributeReceipts([receipt], [{ ...call, ...patch }], 30)[0].collector).toBeUndefined()
  }
})
it('uses Arizona days for calls and Monday weeks across month boundaries', () => {
  expect(collectionDay('2026-10-01T02:00:00Z')).toBe('2026-09-30')
  expect(collectionDay('2026-10-01')).toBe('2026-10-01')
  expect(collectionPeriod('2026-10-01', 'weekly')).toBe('2026-09-28')
})
it('preserves unknown legacy duration and never infers invoice IDs from a note', () => {
  const result = legacyCollectionCall({ id: 'n', accountId: 'a', authorId: 'r', account: { name: 'A' }, author: { name: 'Rep' }, createdAt: new Date(), content: '📞 Collection Call — Invoice 100\nOutcome: Paid in Full\nNo contact reached' })
  expect(result.minutes).toBeNull(); expect(result.invoiceIds).toEqual([]); expect(result.reached).toBe(false)
})
it('validates admin settings without accepting arbitrary keys or invalid ranges', () => {
  expect(reportSettings()).toEqual({ attributionDays: 30, dailyCallGoal: 30, monthlyRecoveryGoal: 25000 })
  expect(() => reportSettings('{"attributionDays":0,"dailyCallGoal":30,"monthlyRecoveryGoal":100}')).toThrow()
  expect(() => reportSettings('{"attributionDays":30,"dailyCallGoal":-1,"monthlyRecoveryGoal":100}')).toThrow()
})
it('preserves all existing collections bonus thresholds', () => {
  expect([24999, 25000, 37499, 37500, 49999, 50000].map(collectionsBonusRate)).toEqual([0, .005, .005, .0075, .0075, .01])
})
it('excludes historical system payment and return notes from call metrics', () => {
  expect(isLegacyCollectionCall('📞 Collection Call — Invoice 100\nSpoke With: Customer (Card Payment)')).toBe(false)
  expect(isLegacyCollectionCall('📞 Collection Call — Invoice 100\nNotes: EasyShip Return Label Generated. Shipment ID: test')).toBe(false)
  expect(isLegacyCollectionCall('📞 Collection Call — Invoice 100\nOutcome: Paid in Full\nSpoke With: Customer')).toBe(true)
})
it('includes the configured collector in compensation even without owned sales, preserving existing ledgers', () => {
  const ledger: Record<string, any> = {}
  ensureCollectionsManagerLedger(ledger, { id: 'collector', name: 'Collector' })
  expect(ledger.collector.repName).toBe('Collector'); expect(ledger.collector.invoices).toEqual([])
  ledger.collector.totalEarned = 123
  ensureCollectionsManagerLedger(ledger, { id: 'collector', name: 'Collector' })
  expect(ledger.collector.totalEarned).toBe(123)
  ensureCollectionsManagerLedger(ledger, undefined); expect(Object.keys(ledger)).toHaveLength(1)
})
