// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn() }))
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator: mocks.auth }))
vi.mock("@/lib/retell-sync", () => ({ reconcileRetellCall: mocks.sync }))
import { POST } from "./route"
const req = (retellCallId = "call_test") => new Request("https://portal.test/api/admin/communications/retell-call", { method: "POST", body: JSON.stringify({ retellCallId }) })
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ session: { user: { dbId: "admin" } } }) })
it("denies non-admin requests without provider access", async () => {
  mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status: 403 }) })
  expect((await POST(req())).status).toBe(403); expect(mocks.sync).not.toHaveBeenCalled()
})
it("rejects path injection before provider access", async () => {
  expect((await POST(req("../other"))).status).toBe(400); expect(mocks.sync).not.toHaveBeenCalled()
})
it("does not leak provider exceptions", async () => {
  mocks.sync.mockRejectedValue(new Error("secret provider payload"))
  const response = await POST(req()); expect(response.status).toBe(409)
  expect(await response.text()).not.toContain("secret provider payload")
})
it("returns private noncacheable scoped results", async () => {
  mocks.sync.mockResolvedValue({ replay: true, callId: "local" })
  const response = await POST(req())
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(mocks.sync).toHaveBeenCalledWith("call_test", "admin")
})
