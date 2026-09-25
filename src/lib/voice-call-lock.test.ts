// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), audit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }))
import { withVoiceCallLock, hasConfirmedVoiceAssociation } from "./voice-call-lock"
beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(fn => fn({ $executeRaw: mocks.lock, operationalAction: { findUnique: mocks.audit } }))
})
it("acquires a shared database lock before reading the association", async () => {
  const order: string[] = []
  mocks.lock.mockImplementation(async () => { order.push("lock") })
  mocks.audit.mockImplementation(async () => { order.push("audit"); return { status: "SUCCEEDED" } })
  expect(await withVoiceCallLock("provider-id", tx => hasConfirmedVoiceAssociation(tx, "provider-id"))).toBe(true)
  expect(order).toEqual(["lock", "audit"])
  expect(mocks.lock.mock.calls[0][1]).toBe("voice-call:provider-id")
  expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "ReadCommitted" })
})
it("does not write when lock acquisition fails", async () => {
  mocks.lock.mockRejectedValue(new Error("timeout"))
  const write = vi.fn()
  await expect(withVoiceCallLock("provider-id", write)).rejects.toThrow("timeout")
  expect(write).not.toHaveBeenCalled()
})
it("rejects invalid lock keys without opening a transaction", async () => {
  await expect(withVoiceCallLock("", vi.fn())).rejects.toThrow()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
