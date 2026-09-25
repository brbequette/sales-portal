// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn() }))
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator: mocks.auth }))
vi.mock("@/lib/zoho-crm-voice", () => ({ syncCrmVoiceCall: mocks.sync }))
import { POST } from "./route"
const req = () => new Request("https://portal.test/crm-call", { method: "POST", body: JSON.stringify({ callId: "local" }) })
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ errorResponse: null }) })
it("does not invoke provider synchronization for non-administrators", async () => {
  mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status: 403 }) })
  expect((await POST(req())).status).toBe(403); expect(mocks.sync).not.toHaveBeenCalled()
})
it("reports an unverified operation as a conflict rather than success", async () => {
  mocks.sync.mockResolvedValue({ state: "AMBIGUOUS", nativeCrmCallSynced: false })
  const response = await POST(req()); expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ nativeCrmCallSynced: false })
})
it("returns the independently verified CRM identifier", async () => {
  mocks.sync.mockResolvedValue({ state: "SUCCEEDED", nativeCrmCallSynced: true, crmCallId: "6821836000027791999" })
  expect((await POST(req())).status).toBe(200)
})
