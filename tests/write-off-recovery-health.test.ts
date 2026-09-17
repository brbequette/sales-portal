import { beforeEach, describe, expect, it, vi } from "vitest"

const requireMasterAdministrator = vi.fn()
const readWriteOffRecoveryHealth = vi.fn()
vi.mock("@/lib/auth-helpers", () => ({ requireMasterAdministrator }))
vi.mock("@/lib/write-off-recovery-health", () => ({ readWriteOffRecoveryHealth }))
vi.mock("@/lib/prisma", () => ({ prisma: { marker: "local-postgres" } }))

const safeHealth = {
  schema: { requiredTables: true, requiredColumns: true, uniqueSourceInvoiceConstraint: true, idempotencyIndex: true, appendOnlyProtection: true, expectedMigrationPresent: true },
  counts: { automaticRecoveryCases: 0, blockedAutomaticCases: 0, triggerObservations: 0, malformedFieldAnomalies: 0, automaticCasesLackingBlockers: 0, automaticCasesWithApprovedCommissionReversals: 0, automaticCasesWithApprovedCostResponsibility: 0, recoveryLedgerPostingsTiedToAutomaticCases: 0, duplicateSourceInvoiceGroups: 0, duplicateIdempotencyKeyGroups: 0 },
  anomalyDiagnostics: { legacyUnknownCount: 8, byReason: { NON_BOOLEAN_VALUE: 8 }, byFieldPath: { LEGACY_UNKNOWN: 8 }, byJsonType: { LEGACY_UNKNOWN: 8 }, byTokenClass: { LEGACY_UNKNOWN: 8 }, distinctSourceInvoiceFingerprintCount: 0, distinctPayloadFingerprintCount: 8, exactReplayDuplicateCount: 0, repeatedPayloadFingerprintGroups: 0, repeatedSourceInvoiceFingerprintGroups: 0, firstObservationTimestamp: "2026-09-16T00:00:00.000Z", lastObservationTimestamp: "2026-09-16T01:00:00.000Z", checkboxLikeStringRepresentationProven: false },
  assertions: { schemaReady: true, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: false, syntheticTestReady: true },
}

describe("write-off recovery production health route", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["unauthenticated", "ADMIN", "Administrator", "salesperson", "manager", "collections"])("denies %s access", async () => {
    requireMasterAdministrator.mockResolvedValue({ session: null, errorResponse: Response.json({ error: "denied" }, { status: 403 }) })
    const { GET } = await import("../src/app/api/admin/write-off-recovery/health/route")
    const response = await GET()
    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(readWriteOffRecoveryHealth).not.toHaveBeenCalled()
  })

  it("returns aggregate-only health to MASTER_ADMIN", async () => {
    requireMasterAdministrator.mockResolvedValue({ session: { user: { role: "MASTER_ADMIN" } }, errorResponse: null })
    readWriteOffRecoveryHealth.mockResolvedValue(safeHealth)
    const { GET } = await import("../src/app/api/admin/write-off-recovery/health/route")
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(body).toEqual(safeHealth)
    expect(JSON.stringify(body)).not.toMatch(/customer|email|phone|invoiceId|zohoId/i)
  })

  it("returns fail-closed health without repair when schema is missing", async () => {
    requireMasterAdministrator.mockResolvedValue({ session: { user: { role: "MASTER_ADMIN" } }, errorResponse: null })
    readWriteOffRecoveryHealth.mockResolvedValue({ ...safeHealth, assertions: { ...safeHealth.assertions, schemaReady: false, unsafeAutomaticCases: true, syntheticTestReady: false } })
    const { GET } = await import("../src/app/api/admin/write-off-recovery/health/route")
    const response = await GET()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})
