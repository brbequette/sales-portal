import { describe, expect, it, vi } from 'vitest'
import { readTaskHub, taskHubClock } from './task-hub-data'
import { readTaskOutcomeReport } from './task-outcome-report'

describe('server-side task discovery and reporting', () => {
  it('pages beyond 500 while binding search and ownership as parameters', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ category: 'sales', count: 650 }]).mockResolvedValueOnce([{ open: 650 }]) }
    const result = await readTaskHub(db as any, 'rep1', { page: '12', pageSize: '50', search: "x' OR 1=1 --", category: 'sales' })
    expect(result.pagination).toEqual({ page: 12, pageSize: 50, total: 650, pages: 13 })
    const sql = db.$queryRaw.mock.calls[0][0]
    expect(sql.text).not.toContain("x' OR 1=1")
    expect(sql.values).toContain('rep1')
    expect(sql.values).toContain(550)
    expect(sql.text).toContain('"duplicateCount"')
  })
  it('keeps counts across categories and narrows queue on the server', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ category: 'sales', count: 6 }, { category: 'communication', count: 4 }]).mockResolvedValueOnce([{ open: 20, waiting: 10 }]) }
    const result = await readTaskHub(db as any, 'rep1', { queue: 'waiting', category: 'sales' })
    expect(result.categoryCounts).toMatchObject({ all: 10, sales: 6, communication: 4 })
    expect(result.pagination.total).toBe(6)
    expect(db.$queryRaw.mock.calls[0][0].text).toContain("status='Waiting on someone else'")
  })
  it('accepts DST day boundaries and rejects invalid clocks', () => {
    const clock = taskHubClock({ day: '2026-11-01', zone: 'America/New_York', dayStart: '2026-11-01T04:00:00Z', dayEnd: '2026-11-02T05:00:00Z' })
    expect(+clock.end - +clock.start).toBe(25*3600000)
    expect(() => taskHubClock({ zone: 'fake/timezone' })).toThrow()
    expect(() => taskHubClock({ offset: 'Infinity' })).toThrow()
  })
  it('deduplicates invoice linkage, separates currency and retains owner scope in revenue queries', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) }
    await readTaskOutcomeReport(db as any, 'rep1', { start: '2026-10-01', end: '2026-11-01', bucket: 'week', zone: 'America/Phoenix' })
    const revenue = db.$queryRaw.mock.calls[1][0]
    expect(revenue.text).toContain('PARTITION BY i.id')
    expect(revenue.text).toContain('WHERE rank=1 GROUP BY bucket,currency')
    expect(revenue.text).toContain('i."accountId"=o."linkedAccountId"')
    expect(revenue.values).toContain('rep1')
    expect(revenue.values).toContain('America/Phoenix')
    expect(revenue.values).toContain('week')
  })
})
