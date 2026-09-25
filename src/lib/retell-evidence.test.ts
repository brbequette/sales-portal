// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest"
import { readRetellCall, retellEvidence, transferOutcome, validRetellId } from "./retell-evidence"
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it("accepts documented opaque identifiers while rejecting path injection", () => {
  expect(validRetellId("Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6")).toBe(true)
  expect(validRetellId("../other")).toBe(false)
})
it("rejects mismatched exact IDs", () => {
  expect(() => retellEvidence({ call_id: "call_other", agent_id: "a" }, "call_test")).toThrow()
})
it("keeps missing transcript unknown and excludes URLs and AI analysis", () => {
  const value = retellEvidence({ call_id: "call_test", agent_id: "a", recording_url: "https://private.example/secret", call_analysis: { call_successful: true } }, "call_test")
  expect(value.transcriptAvailable).toBe(false)
  expect(JSON.stringify(value)).not.toContain("private.example")
  expect(JSON.stringify(value)).not.toContain("call_successful")
})
it("never promotes a call ending or transfer request to an answered call", () => {
  expect(transferOutcome([], "call_transfer")).toBe("UNKNOWN")
  expect(transferOutcome(["transfer_started"], null)).toBe("ATTEMPTED_OUTCOME_UNKNOWN")
  expect(transferOutcome(["transfer_bridged"], null)).toBe("DESTINATION_CONNECTED_NOT_HUMAN_VERIFIED")
})
it("retains contradictory transfer attempts regardless of event arrival order", () => {
  expect(transferOutcome(["transfer_cancelled", "transfer_bridged"], null)).toBe("CONFLICTING_ATTEMPTS")
  expect(transferOutcome(["transfer_bridged", "transfer_cancelled"], null)).toBe("CONFLICTING_ATTEMPTS")
})
it("performs bounded authenticated exact-ID reads with redirects forbidden", async () => {
  vi.stubEnv("RETELL_API_KEY", "test-key")
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ call_id: "call_test", agent_id: "a", transcript: "14 or 17 inch" })))
  vi.stubGlobal("fetch", fetcher)
  expect((await readRetellCall("call_test")).transcript).toBe("14 or 17 inch")
  expect(fetcher).toHaveBeenCalledWith("https://api.retellai.com/v2/get-call/call_test", expect.objectContaining({ redirect: "error", cache: "no-store" }))
})
it("does not return provider error bodies or accept rejected credentials", async () => {
  vi.stubEnv("RETELL_API_KEY", "test-key")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive-provider-error", { status: 401 })))
  await expect(readRetellCall("call_test")).rejects.toThrow("Retell read failed")
})
