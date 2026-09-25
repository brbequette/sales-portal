// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ call: vi.fn(), audit: vi.fn(), task: vi.fn(), upsert: vi.fn(), update: vi.fn(), claim: vi.fn(), fetch: vi.fn(), token: vi.fn() }))
vi.mock("@/lib/zoho-auth", () => ({ getZohoAccessToken: mocks.token, ZOHO_DC: "com" }))
vi.mock("@/lib/prisma", () => ({ prisma: { callLog: { findUnique: mocks.call }, providerWriteOperation: { update: mocks.update, updateMany: mocks.claim } } }))
vi.mock("@/lib/voice-call-lock", () => ({ withVoiceCallLock: (_id: string, fn: (tx: unknown) => unknown) => fn({ callLog: { findUnique: mocks.call }, operationalAction: { findUnique: mocks.audit }, task: { findUnique: mocks.task }, providerWriteOperation: { upsert: mocks.upsert } }) }))
import { crmVoicePayload, syncCrmVoiceCall, verifyCrmVoiceRecord, type CrmVoiceInput } from "./zoho-crm-voice"
const input: CrmVoiceInput = { zohoCallId: "3437f313-1e67-4745-af19-f5f3013cc26f", retellCallId: "call_test", taskId: "6821836000027791003", reason: "Human confirmed TEST", crmAccountId: "6821836000027779001", crmContactId: null, direction: "INBOUND", duration: 85, status: "completed", startedAt: new Date("2026-09-25T11:51:50Z"), transcript: "14 and 17 inch; clarify specifications" }
const id = "6821836000027791999"
const row = () => ({ ...crmVoicePayload(input), id, Call_Duration_in_seconds: 85 })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch)
  mocks.call.mockResolvedValue({ id: "local", zohoCallId: input.zohoCallId, accountId: "account", contactId: null, contact: null, account: { crmAccountId: input.crmAccountId }, direction: input.direction, duration: input.duration, status: input.status, createdAt: input.startedAt, transcript: input.transcript })
  mocks.audit.mockResolvedValue({ status: "SUCCEEDED", entityId: "local", accountId: "account", payload: { contactId: null, taskId: input.taskId, retellCallId: input.retellCallId, reason: input.reason } })
  mocks.task.mockResolvedValue({ accountId: "account" })
  mocks.upsert.mockImplementation(({ create }) => ({ ...create, state: "PENDING", providerRecordIds: null }))
  mocks.claim.mockResolvedValue({ count: 1 }); mocks.token.mockResolvedValue("token")
})
afterEach(() => vi.unstubAllGlobals())
describe("CRM native call persistence", () => {
  it("preserves source evidence, explicit CRM mappings and minute/second duration", () => {
    expect(crmVoicePayload(input)).toMatchObject({ What_Id: { id: input.crmAccountId }, Call_Duration: "01:25" })
    expect(crmVoicePayload(input).Description).toContain(input.transcript)
    expect(() => crmVoicePayload({ ...input, crmAccountId: "books-placeholder" })).toThrow()
    expect(() => crmVoicePayload({ ...input, status: "cancelled" })).toThrow()
    expect(() => crmVoicePayload({ ...input, transcript: "x".repeat(31000) })).toThrow()
  })
  it("requires exact account, transcript and provider duration on readback", () => {
    expect(verifyCrmVoiceRecord(row(), crmVoicePayload(input))).toBe(id)
    expect(verifyCrmVoiceRecord({ ...row(), What_Id: { id: "other" } }, crmVoicePayload(input))).toBeNull()
    expect(verifyCrmVoiceRecord({ ...row(), Call_Duration_in_seconds: 5100 }, crmVoicePayload(input))).toBeNull()
  })
  it("claims once, disables workflows and verifies an accepted record", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ data: [{ status: "success", details: { id } }] })).mockResolvedValueOnce(json({ data: [row()] }))
    expect(await syncCrmVoiceCall("local")).toMatchObject({ state: "SUCCEEDED", nativeCrmCallSynced: true, crmCallId: id })
    const post = mocks.fetch.mock.calls.find(([, options]) => options.method === "POST")!
    expect(JSON.parse(post[1].body).trigger).toEqual([])
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ state: "AMBIGUOUS", providerRecordIds: { callId: id } })
  })
  it("reconciles an existing exact call without submitting another", async () => {
    mocks.fetch.mockResolvedValueOnce(json({ data: [row()] }))
    expect(await syncCrmVoiceCall("local")).toMatchObject({ nativeCrmCallSynced: true })
    expect(mocks.fetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(false)
  })
  it("does not resend syncing, failed or ambiguous operations when search is empty", async () => {
    for (const state of ["SYNCING", "FAILED", "AMBIGUOUS"]) {
      mocks.upsert.mockImplementation(({ create }) => ({ ...create, state }))
      mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }))
      expect(await syncCrmVoiceCall("local")).toMatchObject({ state, nativeCrmCallSynced: false })
    }
    expect(mocks.fetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(false)
  })
  it("preserves uncertain acceptance without retry after transport failure", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new Error("timeout"))
    expect(await syncCrmVoiceCall("local")).toMatchObject({ state: "AMBIGUOUS", nativeCrmCallSynced: false })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it("detects HTTP 200 record rejection and prevents a false success", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ data: [{ status: "error", code: "INVALID_DATA" }] }))
    expect(await syncCrmVoiceCall("local")).toMatchObject({ state: "FAILED", nativeCrmCallSynced: false })
  })
  it("does not submit when another request already claimed the operation", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 })); mocks.claim.mockResolvedValueOnce({ count: 0 })
    expect(await syncCrmVoiceCall("local")).toMatchObject({ state: "SYNCING", nativeCrmCallSynced: false })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it("blocks conflicting existing records instead of overwriting them", async () => {
    mocks.fetch.mockResolvedValueOnce(json({ data: [{ ...row(), Description: "different" }] }))
    expect(await syncCrmVoiceCall("local")).toMatchObject({ state: "AMBIGUOUS", nativeCrmCallSynced: false })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it("blocks changed task/account associations before any provider request", async () => {
    mocks.task.mockResolvedValue({ accountId: "other" })
    await expect(syncCrmVoiceCall("local")).rejects.toThrow("task association changed")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
