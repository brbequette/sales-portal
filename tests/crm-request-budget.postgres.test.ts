// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

// Explicit opt-in: never use DATABASE_URL or production as a fallback.
const fixture = vi.hoisted(() => {
  const value = process.env.CRM_BUDGET_TEST_DATABASE_URL
  if (!value) return { url: undefined }
  const url = new URL(value)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.username !== 'budget_test' || url.pathname !== '/budget_test') throw Error('Disposable budget_test PostgreSQL required')
  return { url: value }
})
vi.mock('../src/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: fixture.url || 'postgresql://invalid/invalid' } } }) }
})
vi.mock('../src/lib/deal-crm-sync', () => ({ getDealSyncConfig: async () => ({ enabled: true }), crmMetadata: async () => ({}), validateDealSyncConfig: () => {}, syncDealToCrm: vi.fn() }))
vi.mock('../src/lib/deal-reconciliation', () => ({ reconcileInvoiceDeal: async (id: string) => `deal-${id}` }))
import { prisma } from '../src/lib/prisma'
import { changeCrmBudget, completeCrmBudget, CrmBudgetBlocked, initialCrmBudget, parseCrmBudget, reserveCrmBudget } from '../src/lib/crm-request-budget'
import { runDealSyncBatch } from '../src/lib/deal-sync-worker'
import { syncDealToCrm } from '../src/lib/deal-crm-sync'

describe.skipIf(!fixture.url)('real PostgreSQL request reservations and job leases', () => {
  const other = new PrismaClient({ datasources: { db: { url: fixture.url || 'postgresql://invalid/invalid' } } })
  beforeAll(async () => {
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "SystemSetting" (key text PRIMARY KEY, value text NOT NULL, "businessDefaults" jsonb, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())')
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "Invoice" (id text PRIMARY KEY, "dealId" text)')
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "Deal" (id text PRIMARY KEY, "rawData" jsonb)')
    await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "DealSyncJob" ("invoiceId" text PRIMARY KEY, "changedAt" timestamptz DEFAULT now(), "checkedAt" timestamptz, "leaseUntil" timestamptz, "nextAttemptAt" timestamptz DEFAULT now(), "lastError" text, attempts integer NOT NULL DEFAULT 0)')
  })
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "SystemSetting", "Invoice", "Deal", "DealSyncJob"')
    vi.mocked(syncDealToCrm).mockReset()
  })
  afterAll(async () => { await Promise.all([prisma.$disconnect(), other.$disconnect()]) })
  const seedBudget = (limit: number, maxInFlight: number) => changeCrmBudget(prisma, (_s, now) => ({ ...initialCrmBudget(now), mode: 'enforce', baselineVerified: true, expiresAt: new Date(now.getTime() + 60000).toISOString(), limit, maxInFlight }))
  const readBudget = async () => parseCrmBudget((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'crm_request_budget_v1' } })).value)
  const seedJob = async () => {
    await prisma.$executeRaw`INSERT INTO "Invoice" (id) VALUES ('one')`
    await prisma.$executeRaw`INSERT INTO "DealSyncJob" ("invoiceId", "changedAt", "checkedAt", "lastError") VALUES ('one', now(), now()-interval '1 day', 'KEEP_HOLD')`
  }
  it('serializes first-row creation across clients without losing reservations', async () => {
    const calls = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => changeCrmBudget(i % 2 ? other : prisma, (s, now) => reserveCrmBudget(s, `init-${i}`, now))))
    expect(calls.every(x => x.status === 'fulfilled')).toBe(true)
    expect((await readBudget()).reserved).toBe(12)
  })
  it('allows exactly the final two slots under twelve simultaneous claims', async () => {
    await seedBudget(2, 10)
    const calls = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => changeCrmBudget(i % 2 ? other : prisma, (s, now) => reserveCrmBudget(s, `cap-${i}`, now))))
    expect(calls.filter(x => x.status === 'fulfilled')).toHaveLength(2)
    expect(calls.filter(x => x.status === 'rejected').every(x => x.status === 'rejected' && x.reason instanceof CrmBudgetBlocked && x.reason.code === 'LIMIT')).toBe(true)
    expect((await readBudget()).reserved).toBe(2)
  })
  it('does not reclaim a crashed reservation and enforces concurrent capacity', async () => {
    await seedBudget(50, 1)
    await changeCrmBudget(prisma, (s, now) => reserveCrmBudget(s, 'crashed', now))
    await expect(changeCrmBudget(other, (s, now) => reserveCrmBudget(s, 'next', now))).rejects.toThrow('CONCURRENCY')
    await changeCrmBudget(other, (s, now) => completeCrmBudget(s, 'crashed', {}, now))
    await expect(changeCrmBudget(prisma, (s, now) => reserveCrmBudget(s, 'next', now))).rejects.toThrow('HALTED')
    expect(await readBudget()).toMatchObject({ reserved: 1, uncertain: 1 })
  })
  it('rolls back a failed reservation transaction', async () => {
    await seedBudget(5, 1)
    await expect(changeCrmBudget(prisma, (s, now) => { reserveCrmBudget(s, 'rollback', now); throw Error('rollback') })).rejects.toThrow('rollback')
    expect((await readBudget()).reserved).toBe(0)
    await changeCrmBudget(other, (s, now) => reserveCrmBudget(s, 'success', now))
    expect((await readBudget()).reserved).toBe(1)
  })
  it('defers only its own lease, preserving checked revision and business hold', async () => {
    await seedJob()
    const before = await prisma.$queryRaw<{ checkedAt: Date; changedAt: Date }[]>`SELECT "checkedAt", "changedAt" FROM "DealSyncJob"`
    vi.mocked(syncDealToCrm).mockRejectedValueOnce(new CrmBudgetBlocked('LIMIT'))
    expect((await runDealSyncBatch()).results[0].status).toBe('DEFERRED')
    const [after] = await prisma.$queryRaw<{ checkedAt: Date; changedAt: Date; lastError: string; leaseUntil: Date | null }[]>`SELECT * FROM "DealSyncJob"`
    expect(after).toMatchObject({ ...before[0], lastError: 'KEEP_HOLD', leaseUntil: null })
  })
  it('two workers cannot process the same active lease concurrently', async () => {
    await seedJob()
    let release!: () => void
    let acquired!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { acquired = resolve })
    vi.mocked(syncDealToCrm).mockImplementationOnce(async () => { acquired(); await gate; return { dealId: 'deal-one', crmId: 'test', packageHash: 'test' } })
    const first = runDealSyncBatch(1)
    await ready
    try { expect((await runDealSyncBatch(1)).results).toHaveLength(0) } finally { release() }
    expect((await first).results).toHaveLength(1)
    expect(syncDealToCrm).toHaveBeenCalledTimes(1)
  })
  it('cannot release a replacement lease owned by another worker', async () => {
    await seedJob()
    vi.mocked(syncDealToCrm).mockImplementationOnce(async () => {
      await other.$executeRaw`UPDATE "DealSyncJob" SET "leaseUntil"=clock_timestamp()+interval '10 minutes' WHERE "invoiceId"='one'`
      throw new CrmBudgetBlocked('CONCURRENCY')
    })
    await runDealSyncBatch()
    const [job] = await prisma.$queryRaw<{ retained: boolean; lastError: string }[]>`SELECT "leaseUntil">now()+interval '9 minutes' AS retained,"lastError" FROM "DealSyncJob"`
    expect(job).toMatchObject({ retained: true, lastError: 'KEEP_HOLD' })
  })
  it('does not mark a concurrently changed invoice revision checked', async () => {
    await seedJob()
    const [before] = await prisma.$queryRaw<{ checkedAt: Date }[]>`SELECT "checkedAt" FROM "DealSyncJob"`
    vi.mocked(syncDealToCrm).mockImplementationOnce(async () => { await other.$executeRaw`UPDATE "DealSyncJob" SET "changedAt"=clock_timestamp()+interval '1 second' WHERE "invoiceId"='one'`; return { dealId: 'deal-one', crmId: 'test', packageHash: 'test' } })
    await runDealSyncBatch(1)
    const [after] = await prisma.$queryRaw<{ checkedAt: Date }[]>`SELECT "checkedAt" FROM "DealSyncJob"`
    expect(after.checkedAt).toEqual(before.checkedAt)
  })
})
