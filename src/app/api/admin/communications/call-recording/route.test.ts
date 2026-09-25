// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), call: vi.fn(), audit: vi.fn(), token: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator: mocks.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { callLog: { findUnique: mocks.call }, operationalAction: { findUnique: mocks.audit } } }))
vi.mock("@/lib/zoho-voice-auth", () => ({ getZohoVoiceAccessToken: mocks.token }))
import { POST } from "./route"
const request = () => new Request("https://portal.test/recording", { method: "POST", body: JSON.stringify({ callId: "call" }) })
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch)
  mocks.auth.mockResolvedValue({ errorResponse: null })
  mocks.call.mockResolvedValue({ id: "call", accountId: "test", zohoCallId: "provider" })
  mocks.audit.mockResolvedValue({ status: "SUCCEEDED", entityId: "call", accountId: "test", payload: { recordingFilename: "provider.mp3" } })
  mocks.token.mockResolvedValue("test-token")
})
afterEach(() => vi.unstubAllGlobals())
it("rejects unauthorized playback before provider or database reads", async () => {
  mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status: 403 }) })
  expect((await POST(request())).status).toBe(403)
  expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled()
})
it("rejects a mismatched account audit", async () => {
  mocks.audit.mockResolvedValue({ status: "SUCCEEDED", entityId: "call", accountId: "other" })
  expect((await POST(request())).status).toBe(409)
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it("never guesses missing or unsafe filenames", async () => {
  for (const filename of [null, "../other.wav", "https://attacker.test/audio", "one.wav,two.wav"]) {
    mocks.audit.mockResolvedValue({ status: "SUCCEEDED", entityId: "call", accountId: "test", payload: { recordingFilename: filename } })
    expect((await POST(request())).status).toBe(409)
  }
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it("rejects provider errors and non-audio bodies", async () => {
  for (const response of [new Response("error", { status: 403 }), new Response("{}", { headers: { "Content-Type": "application/json" } })]) {
    mocks.fetch.mockResolvedValue(response)
    expect((await POST(request())).status).toBe(502)
  }
})
it("streams authorized audio without exposing credentials or public caching", async () => {
  mocks.fetch.mockResolvedValue(new Response(new Uint8Array([255, 227, 72, 4, 0]), { headers: { "Content-Type": "application/octet-stream" } }))
  const result = await POST(request())
  expect(result.status).toBe(200); expect((await result.arrayBuffer()).byteLength).toBe(5)
  expect(result.headers.get("Cache-Control")).toBe("private, no-store")
  expect(result.headers.get("Authorization")).toBeNull()
  expect(mocks.fetch.mock.calls[0][0]).toBe("https://voice.zoho.com/rest/json/zv/logs/voicerecording?recording_filename=provider.mp3&mode=play")
  expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" })
})

it("rejects oversized recordings before buffering", async () => {
  mocks.fetch.mockResolvedValue(new Response("large", { headers: { "Content-Length": "30000000" } }))
  expect((await POST(request())).status).toBe(413)
})
