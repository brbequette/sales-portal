import { describe, expect, it, vi } from "vitest"
import { readWriteOffRecoveryHealth } from "../src/lib/write-off-recovery-health"
import { isAdministratorRole } from "../src/lib/roles"

describe("write-off recovery health reader", () => {
  it("documents that broad administrator policy is separate from this MASTER_ADMIN-only endpoint", () => {
    expect(["MASTER_ADMIN", "ADMIN", "Administrator"].every(isAdministratorRole)).toBe(true)
    expect(["MANAGER", "COLLECTIONS", "AGENT", "VIEWER"].some(isAdministratorRole)).toBe(false)
  })

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
      }])
      .mockResolvedValueOnce([{
        legacy_unknown: 1, by_reason: { NON_BOOLEAN_VALUE: 1 }, by_field_path: { LEGACY_UNKNOWN: 1 },
        by_json_type: { LEGACY_UNKNOWN: 1 }, by_token_class: { LEGACY_UNKNOWN: 1 },
        distinct_source_invoices: 0, distinct_payloads: 1, exact_replays: 0,
        repeated_payloads: 0, repeated_source_invoices: 0,
        first_observed: new Date("2026-09-16T00:00:00Z"), last_observed: new Date("2026-09-16T00:00:00Z"),
        checkbox_like_string_proven: false,
      }]) }
    const health = await readWriteOffRecoveryHealth(database as never)
    expect(health.counts).toMatchObject({ automaticRecoveryCases: 2, blockedAutomaticCases: 2, triggerObservations: 4, malformedFieldAnomalies: 1 })
    expect(health.anomalyDiagnostics).toMatchObject({ legacyUnknownCount: 1, byFieldPath: { LEGACY_UNKNOWN: 1 }, checkboxLikeStringRepresentationProven: false })
    expect(health.assertions).toEqual({ schemaReady: true, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: false, syntheticTestReady: true })
    expect(JSON.stringify(health)).not.toMatch(/customer|email|phone/i)
  })
})
