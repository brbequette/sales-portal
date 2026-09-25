// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ verify: vi.fn(), association: vi.fn(), persist: vi.fn(), inbox: vi.fn() }))
vi.mock("retell-sdk", () => ({ default: { verify: mocks.verify } }))
vi.mock("@/lib/retell-sync", () => ({ confirmedRetellAssociation: mocks.association, persistRetellEvidence: mocks.persist, persistUnassignedRetellEvidence: mocks.inbox }))
import { POST } from "./route"
const raw = '{ "event":"transfer_bridged", "call":{"call_id":"call_test"} }'
const request = (signature = "signed") => new Request("https://portal.test/api/webhooks/retell", { method: "POST", headers: { "x-retell-signature": signature }, body: raw })
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("RETELL_API_KEY", "test"); mocks.verify.mockResolvedValue(true); mocks.association.mockResolvedValue({ audit: {} }) })
it("verifies the unmodified raw body before any database work", async () => {
  mocks.verify.mockResolvedValue(false)
  expect((await POST(request())).status).toBe(401)
  expect(mocks.verify).toHaveBeenCalledWith(raw, "test", "signed")
  expect(mocks.association).not.toHaveBeenCalled()
})
it("accepts sparse signed transfer events without inventing a transcript", async () => {
  expect((await POST(request())).status).toBe(204)
  expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ transcript: null, callId: "call_test" }), "transfer_bridged", null, expect.any(String))
})
it("does not attach unmatched calls to any account", async () => {
  mocks.association.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(204)
  expect(mocks.persist).not.toHaveBeenCalled()
  expect(mocks.inbox).toHaveBeenCalledOnce()
})
it("does not acknowledge an unassigned event when inbox persistence fails", async () => {
  mocks.association.mockResolvedValue(null); mocks.inbox.mockRejectedValue(new Error("rollback"))
  expect((await POST(request())).status).toBe(503)
})
it("returns retryable failure on database failure instead of discarding an event", async () => {
  mocks.association.mockRejectedValue(new Error("database unavailable"))
  expect((await POST(request())).status).toBe(503)
})
it("never acknowledges failed persistence", async () => {
  mocks.persist.mockRejectedValue(new Error("rollback"))
  expect((await POST(request())).status).toBe(503)
})
