import { beforeEach, describe, expect, it, vi } from "vitest"

const requireAdministrator = vi.fn()
const readWriteOffRecoveryHealth = vi.fn()
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator }))
vi.mock("@/lib/write-off-recovery-health", () => ({ readWriteOffRecoveryHealth }))
vi.mock("@/lib/prisma", () => ({ prisma: { marker: "local-postgres" } }))

const safeHealth = {
  schema: { requiredTables: true, requiredColumns: true, uniqueSourceInvoiceConstraint: true, idempotencyIndex: true, appendOnlyProtection: true, expectedMigrationPresent: true },
  counts: { automaticRecoveryCases: 0, blockedAutomaticCases: 0, triggerObservations: 0, malformedFieldAnomalies: 0, automaticCasesLackingBlockers: 0, automaticCasesWithApprovedCommissionReversals: 0, automaticCasesWithApprovedCostResponsibility: 0, recoveryLedgerPostingsTiedToAutomaticCases: 0, duplicateSourceInvoiceGroups: 0, duplicateIdempotencyKeyGroups: 0 },
  assertions: { schemaReady: true, duplicatesFound: false, unexpectedFinancialPostings: false, unsafeAutomaticCases: false, syntheticTestReady: true },
}

describe("write-off recovery production health route", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["unauthenticated", "salesperson", "manager", "collections"])("denies %s access", async () => {
    requireAdministrator.mockResolvedValue({ session: null, errorResponse: Response.json({ error: "denied" }, { status: 403 }) })
    const { GET } = await import("../src/app/api/admin/write-off-recovery/health/route")
    const response = await GET()
    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(readWriteOffRecoveryHealth).not.toHaveBeenCalled()
  })

  it.each(["MASTER_ADMIN", "ADMIN", "Administrator"])("returns aggregate-only health to %s", async role => {
    requireAdministrator.mockResolvedValue({ session: { user: { role } }, errorResponse: null })
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
    requireAdministrator.mockResolvedValue({ session: { user: { role: "ADMIN" } }, errorResponse: null })
    readWriteOffRecoveryHealth.mockResolvedValue({ ...safeHealth, assertions: { ...safeHealth.assertions, schemaReady: false, unsafeAutomaticCases: true, syntheticTestReady: false } })
    const { GET } = await import("../src/app/api/admin/write-off-recovery/health/route")
    const response = await GET()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})
