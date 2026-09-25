// @vitest-environment node
import { createHmac } from "node:crypto"
import Retell from "retell-sdk"
import { expect, it } from "vitest"
const key = "test-only-key"
const sign = (body: string, timestamp: number) => `v=${timestamp},d=${createHmac("sha256", key).update(body + timestamp).digest("hex")}`
it("accepts a current signed payload and rejects a changed body", async () => {
  const body = '{ "event": "call_ended" }', signature = sign(body, Date.now())
  expect(await Retell.verify(body, key, signature)).toBe(true)
  expect(await Retell.verify(body + " ", key, signature)).toBe(false)
})
it("rejects stale, future and malformed signatures", async () => {
  for (const signature of [sign("{}", Date.now() - 3600000), sign("{}", Date.now() + 3600000), "invalid"]) {
    expect(await Retell.verify("{}", key, signature)).toBe(false)
  }
})
