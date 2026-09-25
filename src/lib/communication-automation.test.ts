import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
  communicationEvent: { upsert: vi.fn() },
  task: { upsert: vi.fn() },
  automationRecommendation: { findFirst: vi.fn(), upsert: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))
import { indexCallAndCreateSafeFollowUp } from "./communication-automation"

const call = {
  id: "provider-call-1", accountId: "account-1", contactId: null,
  authorId: "ben", direction: "INBOUND", status: "missed",
  fromNumber: "16183355304", toNumber: "18556750511", duration: 0,
  transcript: null, aiSummary: null, createdAt: new Date("2026-09-25T11:00:00Z"),
}

describe("voice follow-up replay safety", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.account.findUnique.mockResolvedValue({ ownerId: "ben", name: "TEST" })
    db.automationRecommendation.findFirst.mockResolvedValue(null)
  })

  it("anchors deadlines to the call and leaves existing task decisions untouched", async () => {
    await indexCallAndCreateSafeFollowUp(call)
    await indexCallAndCreateSafeFollowUp(call)
    for (const [args] of db.task.upsert.mock.calls) {
      expect(args.create.dueDate).toEqual(new Date("2026-09-25T11:10:00Z"))
      expect(args.update).toEqual({})
      expect(args.where.zohoId).toBe("voice_callback_provider-call-1")
    }
  })

  it("concurrent deliveries target the same unique recommendation key", async () => {
    await Promise.all([indexCallAndCreateSafeFollowUp(call), indexCallAndCreateSafeFollowUp(call)])
    const writes = db.automationRecommendation.upsert.mock.calls.map(([args]) => args)
    expect(writes).toHaveLength(2)
    expect(writes[0].where).toEqual(writes[1].where)
    expect(writes[0].create.id).toBe(writes[0].where.id)
    expect(writes[0].update).toEqual({})
  })

  it("does not recreate a previously reviewed legacy recommendation", async () => {
    db.automationRecommendation.findFirst.mockResolvedValue({ id: "legacy-reviewed" })
    await indexCallAndCreateSafeFollowUp(call)
    expect(db.automationRecommendation.findFirst.mock.calls[0][0].where).not.toHaveProperty("status")
    expect(db.automationRecommendation.upsert).not.toHaveBeenCalled()
  })

  it("does not invent a task or order from an incomplete answered-call transcript", async () => {
    await indexCallAndCreateSafeFollowUp({ ...call, status: "answered", transcript: "buy some PL" })
    expect(db.communicationEvent.upsert).toHaveBeenCalledOnce()
    expect(db.task.upsert).not.toHaveBeenCalled()
    expect(db.automationRecommendation.upsert).not.toHaveBeenCalled()
  })

  it("indexes unmatched calls without scheduling customer follow-up", async () => {
    db.account.findUnique.mockResolvedValue({ ownerId: "ben", name: "Unknown Voice Caller", zohoId: "unknown-voice-caller" })
    await indexCallAndCreateSafeFollowUp(call)
    expect(db.communicationEvent.upsert).toHaveBeenCalledOnce()
    expect(db.task.upsert).not.toHaveBeenCalled()
    expect(db.automationRecommendation.upsert).not.toHaveBeenCalled()
  })
})
