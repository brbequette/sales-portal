// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ matches: vi.fn(), unique: vi.fn(), call: vi.fn(), create: vi.fn(), history: vi.fn(), read: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { operationalAction: { findMany: mocks.matches } } }))
vi.mock("@/lib/voice-call-lock", () => ({ withVoiceCallLock: (_id: string, work: (tx: unknown) => unknown) => work({ operationalAction: { findUnique: mocks.unique, create: mocks.create, findMany: mocks.history }, callLog: { findUnique: mocks.call } }) }))
vi.mock("@/lib/retell-evidence", async importOriginal => ({ ...await importOriginal<typeof import("./retell-evidence")>(), readRetellCall: mocks.read }))
import { persistRetellEvidence, reconcileRetellCall } from "./retell-sync"
import { retellEvidence } from "./retell-evidence"
const audit = { id: "audit", status: "SUCCEEDED", entityId: "local", accountId: "account", payload: { zohoCallId: "zoho", retellCallId: "call_test", contactId: "contact" } }
const evidence = retellEvidence({ call_id: "call_test", agent_id: "agent", transcript: "Unknown blade size" }, "call_test")
beforeEach(() => {
  vi.resetAllMocks(); mocks.matches.mockResolvedValue([audit]); mocks.unique.mockImplementation(({ where }) => Promise.resolve(where.id ? audit : null))
  mocks.call.mockResolvedValue({ id: "local", zohoCallId: "zoho", accountId: "account", contactId: "contact" })
  mocks.history.mockResolvedValue([]); mocks.read.mockResolvedValue(evidence)
})
it("rejects unmatched and ambiguous associations before reading Retell", async () => {
  for (const matches of [[], [audit, audit]]) {
    mocks.matches.mockResolvedValue(matches)
    await expect(reconcileRetellCall("call_test", "admin")).rejects.toThrow()
  }
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
})
it("stores one immutable evidence version and preserves the source association", async () => {
  const result = await persistRetellEvidence(evidence, "API_READ", "admin")
  expect(result.associationBasis).toBe("HUMAN_CONFIRMED")
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({ entityId: "local", accountId: "account", actionType: "RETELL_CALL_EVIDENCE" })
})
it("replays without another write", async () => {
  mocks.unique.mockResolvedValue(audit)
  expect((await persistRetellEvidence(evidence, "API_READ", "admin")).replay).toBe(true)
  expect(mocks.create).not.toHaveBeenCalled()
})
it("rejects a changed account/contact inside the shared lock", async () => {
  mocks.call.mockResolvedValue({ id: "local", zohoCallId: "zoho", accountId: "other", contactId: "contact" })
  await expect(persistRetellEvidence(evidence, "API_READ", "admin")).rejects.toThrow("Association changed")
  expect(mocks.create).not.toHaveBeenCalled()
})
it("retains contradictory events without relying on arrival order", async () => {
  mocks.history.mockResolvedValue([{ payload: { source: "transfer_cancelled" } }, { payload: { source: "transfer_bridged" } }])
  expect((await persistRetellEvidence(evidence, "API_READ", "admin")).transferOutcome).toBe("CONFLICTING_ATTEMPTS")
})
