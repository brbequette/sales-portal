import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
const {
  MMS_CANARY_ENDPOINT,
  MMS_MAX_BYTES,
  normalizeSingleRecipient,
  optimizeMmsImage,
  submitMmsCanary,
} = await import(new URL("../src/lib/mms-canary.ts", import.meta.url).href)
const { isAdministratorRole } = await import(new URL("../src/lib/roles.ts", import.meta.url).href)

test("non-administrators cannot access the panel or send endpoint", () => {
  const panel = fs.readFileSync("src/components/MmsCanaryPanel.tsx", "utf8")
  const endpoint = fs.readFileSync("netlify/functions/campaign-job-test-send.ts", "utf8")
  assert.match(panel, /isAdministratorRole\(currentUser\?\.role\)/)
  assert.match(panel, /if \(!isInitialized \|\| !administrator\) return null/)
  assert.match(endpoint, /withFunctionAuth\(authenticatedHandler, \{ requireAdmin: true \}\)/)
  assert.equal(isAdministratorRole("MANAGER"), false)
  assert.equal(isAdministratorRole("AGENT"), false)
  assert.equal(isAdministratorRole("ADMIN"), true)
})

test("oversized PNG input is resized and recompressed below the MMS ceiling", async () => {
  const qualities = []
  const adapter = {
    async decode() { return { width: 2048, height: 3072 } },
    async encode(_image, _width, _height, quality) {
      qualities.push(quality)
      const size = quality > 0.66 ? 1_050_000 : 820_000
      return new Blob([new Uint8Array(size)], { type: "image/jpeg" })
    },
  }
  const source = { name: "large promo.png", type: "image/png", size: 3_500_000 }
  const optimized = await optimizeMmsImage(source, adapter)
  assert.equal(optimized.width, 1024)
  assert.equal(optimized.height, 1536)
  assert.equal(optimized.mimeType, "image/jpeg")
  assert.ok(optimized.byteSize <= MMS_MAX_BYTES)
  assert.ok(qualities.length > 1, "oversized output should be recompressed")
})

test("one normalized recipient is submitted only to test-send", async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ success: true, provider: { code: "ZVSMS-2000" } }), { status: 200 })
  }
  const result = await submitMmsCanary({
    recipient: "(618) 335-5304",
    sender: "+1 (432) 538-1379",
    message: "One test",
    imageDataUrl: "data:image/jpeg;base64,YQ==",
  }, fakeFetch)

  assert.equal(result.httpStatus, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, MMS_CANARY_ENDPOINT)
  assert.doesNotMatch(calls[0].url, /campaign-job\/create/)
  const body = JSON.parse(String(calls[0].init?.body))
  assert.deepEqual(body, {
    testPhone: "+16183355304",
    fromNumber: "+14325381379",
    channel: "SMS",
    text: "One test",
    imageUrl: "data:image/jpeg;base64,YQ==",
  })
})

test("provider failures are returned after one request with no retry", async () => {
  let calls = 0
  const fakeFetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ success: false, provider: { code: "ZVSMS-4000", message: "Rejected" } }), { status: 200 })
  }
  const result = await submitMmsCanary({
    recipient: "+16183355304",
    sender: "+14325381379",
    message: "One test",
    imageDataUrl: "data:image/jpeg;base64,YQ==",
  }, fakeFetch)
  assert.equal(calls, 1)
  assert.deepEqual(result.response, { success: false, provider: { code: "ZVSMS-4000", message: "Rejected" } })
})

test("multiple recipients fail before any request", async () => {
  let calls = 0
  const fakeFetch = async () => { calls += 1; return new Response("{}") }
  await assert.rejects(() => submitMmsCanary({
    recipient: "+16183355304,+16185550123",
    sender: "+14325381379",
    message: "One test",
    imageDataUrl: "data:image/jpeg;base64,YQ==",
  }, fakeFetch), /exactly one recipient/)
  assert.equal(calls, 0)
  assert.throws(() => normalizeSingleRecipient("+16183355304\n+16185550123"), /exactly one recipient/)
})

test("panel requires exact confirmation and exposes the complete provider result", () => {
  const panel = fs.readFileSync("src/components/MmsCanaryPanel.tsx", "utf8")
  const endpoint = fs.readFileSync("netlify/functions/campaign-job-test-send.ts", "utf8")
  assert.match(panel, /Exact confirmation/)
  assert.match(panel, /Send exactly one MMS/)
  assert.match(panel, /APPROVED_CANARY_RECIPIENT = "\+16183355304"/)
  assert.match(panel, /FREE WASHER & DRYER/)
  assert.match(panel, /JSON\.stringify\(result/)
  assert.doesNotMatch(panel, /campaign-job\/create/)
  for (const field of ["httpStatus", "accepted", "code", "status", "message", "id", "response"]) {
    assert.match(endpoint, new RegExp(`${field}:`), `provider response must retain ${field}`)
  }
})
