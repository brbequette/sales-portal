// @vitest-environment node
import { afterAll, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "../src/lib/prisma"
import { hasConfirmedVoiceAssociation, withVoiceCallLock } from "../src/lib/voice-call-lock"

// This suite writes disposable fixtures. Never accept production as a fallback.
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid")
const disposable = process.env.CI === "true" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.username === "lifecycle_ci" && url.pathname === "/lifecycle_chain"
const fixtureKeys: string[] = []
afterAll(async () => {
  if (disposable) await prisma.operationalAction.deleteMany({ where: { idempotencyKey: { in: fixtureKeys } } })
  await prisma.$disconnect()
})
it("a waiting writer sees a manual association committed after its preflight", async () => {
  if (!disposable) throw new Error("Disposable PostgreSQL CI service required; production testing prohibited")
  const source = `lock-test-${randomUUID()}`
  const key = `voice-manual-association:${source}`
  fixtureKeys.push(key)
  let unlock!: () => void
  let acquired!: () => void
  const gate = new Promise<void>(resolve => { unlock = resolve })
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const manual = withVoiceCallLock(source, async tx => {
    acquired(); await gate
    await tx.operationalAction.create({ data: { idempotencyKey: key, actionType: "VOICE_MANUAL_ASSOCIATION", entityType: "TEST", entityId: source, status: "SUCCEEDED" } })
  })
  await ready
  // The old guard really did observe no audit before the manual write committed.
  expect(await prisma.operationalAction.findUnique({ where: { idempotencyKey: key } })).toBeNull()
  let entered = false
  const replay = withVoiceCallLock(source, async tx => {
    entered = true
    return hasConfirmedVoiceAssociation(tx, source)
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(entered).toBe(false)
  } finally { unlock() }
  await manual
  expect(await replay).toBe(true)
}, 20000)
it("transaction rollback releases the source lock", async () => {
  if (!disposable) throw new Error("Disposable PostgreSQL CI service required")
  const source = `rollback-${randomUUID()}`
  await expect(withVoiceCallLock(source, async () => { throw new Error("rollback") })).rejects.toThrow("rollback")
  expect(await withVoiceCallLock(source, async () => "recovered")).toBe("recovered")
})
