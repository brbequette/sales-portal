// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { signVoicePreview, type VoicePreview } from "@/lib/voice-call-preview"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), transaction: vi.fn(),
  auditFind: vi.fn(), callFind: vi.fn(), taskFind: vi.fn(), contactFind: vi.fn(), callUpsert: vi.fn(), auditCreate: vi.fn(), eventUpdate: vi.fn(), eventUpsert: vi.fn() }))
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator: mocks.auth }))
vi.mock("@/lib/zoho-voice-auth", () => ({ getZohoVoiceAccessToken: mocks.token }))
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }))
import { POST } from "./route"
const preview: VoicePreview = { actorId: "admin", accountId: "test", contactId: null, retellCallId: "call_test", taskId: "existing-task", reason: "Explicit human-confirmed TEST association", transcript: "14 and 17 inch", expiresAt: Date.now() + 300000, previousUpdatedAt: null,
  evidence: { zohoCallId: "3437f313-1e67-4745-af19-f5f3013cc26f", fromNumber: "+16028479868", toNumber: "+19282645832", direction: "INBOUND", duration: 85, status: "completed", startedAt: "2026-09-25T11:51:50Z", recordingFilename: null } }
const request = (value = preview) => new Request("https://portal.test/api/admin/communications/reconcile-call", { method: "POST", body: JSON.stringify({ mode: "apply", token: signVoicePreview(value, "test-secret") }) })
describe("scoped call apply", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret")
    mocks.auth.mockResolvedValue({ session: { user: { dbId: "admin" } }, errorResponse: null })
    mocks.auditFind.mockResolvedValue(null)
    mocks.callFind.mockResolvedValue(null)
    mocks.taskFind.mockResolvedValue({ accountId: "test" })
    mocks.callUpsert.mockResolvedValue({ id: "local-call" })
    mocks.transaction.mockImplementation(async fn => fn({
      operationalAction: { findUnique: mocks.auditFind, create: mocks.auditCreate },
      callLog: { findUnique: mocks.callFind, upsert: mocks.callUpsert }, task: { findUnique: mocks.taskFind }, contact: { findFirst: mocks.contactFind },
      communicationEvent: { updateMany: mocks.eventUpdate, upsert: mocks.eventUpsert },
    }))
  })
  it("rejects unauthorized users before any database or provider operation", async () => {
    mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status: 403 }) })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it("persists one audited call and reports CRM synchronization incomplete", async () => {
    const result = await POST(request())
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ callId: "local-call", nativeCrmCallSynced: false, outboundActions: 0 })
    expect(mocks.callUpsert).toHaveBeenCalledOnce()
    expect(mocks.auditCreate).toHaveBeenCalledOnce()
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it("returns an existing association without another write", async () => {
    mocks.auditFind.mockResolvedValue({ status: "SUCCEEDED", accountId: "test", entityId: "local-call", payload: { retellCallId: "call_test", taskId: "existing-task", contactId: null } })
    mocks.callFind.mockResolvedValue({ id: "local-call", accountId: "test", contactId: null })
    const response = await POST(request())
    expect(await response.json()).toMatchObject({ replay: true, callId: "local-call" })
    expect(mocks.callUpsert).not.toHaveBeenCalled()
  })
  it("rejects stale call versions or changed task associations", async () => {
    mocks.callFind.mockResolvedValue({ updatedAt: new Date() })
    expect((await POST(request())).status).toBe(409)
    mocks.callFind.mockResolvedValue(null)
    mocks.taskFind.mockResolvedValue({ accountId: "other" })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.callUpsert).not.toHaveBeenCalled()
  })
  it("rejects previews bound to another administrator", async () => {
    expect((await POST(request({ ...preview, actorId: "other" }))).status).toBe(409)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
