import { describe, expect, it, vi } from "vitest"
import { readWriteOffRecoveryHealth } from "../src/lib/write-off-recovery-health"

describe("write-off recovery health reader", () => {
  it("fails closed with null counts when catalog inspection fails", async () => {
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error("missing relation")) }
    const health = await readWriteOffRecoveryHealth(database as never)
    expect(health.assertions).toMatchObject({ schemaReady: false, unsafeAutomaticCases: true, syntheticTestReady: false })
    expect(Object.values(health.counts).every(value => value === null)).toBe(true)
    expect(database.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it("maps aggregate rows and computes readiness without exposing records", async () => {
    const database = { $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([{ source_unique: true, idempotency_unique: true }])
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([{
        automatic_cases: 2, blocked_cases: 2, observations: 4, anomalies: 1,
        lacking_blockers: 0, commission_reversals: 0, cost_responsibility: 0,
        ledger_postings: 0, duplicate_sources: 0, duplicate_keys: 0,
      }]) }
    const health = await readWriteOffRecoveryHealth(database as never)
    expect(health.counts).toMatchObject({ automaticRecoveryCases: 2, blockedAutomaticCases: 2, triggerObservations: 4, malformedFieldAnomalies: 1 })
    expect(health.assertions).toEqual({ schemaReady: true, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: false, syntheticTestReady: true })
    expect(JSON.stringify(health)).not.toMatch(/customer|email|phone/i)
  })
})
