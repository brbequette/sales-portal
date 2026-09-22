import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), createReview: vi.fn() }))
vi.mock("./prisma", () => ({ prisma: { phoneDeliverability: { findUnique: mocks.findUnique }, phoneDeliverabilityReview: { create: mocks.createReview } } }))
import { guardSmsSend } from "./sms-suppression"
describe("shared SMS suppression enforcement", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findUnique.mockResolvedValue(null) })
  it("blocks protected opt-out for transactional traffic", async () => { mocks.findUnique.mockResolvedValue({ suppressionStatus: "OPT_OUT_SUPPRESSED", suppressionReason: "STOP", providerCode: "STOP", lastCheckedAt: new Date(), deliverabilityStatus: "OPTED_OUT" }); expect(await guardSmsSend({ phone: "+16183355304", traffic: "TRANSACTIONAL" })).toMatchObject({ allowed: false, protectedSuppression: true }) })
  it("blocks technical suppression for promotional traffic", async () => { mocks.findUnique.mockResolvedValue({ suppressionStatus: "TECHNICAL_SUPPRESSED", suppressionReason: "landline", providerCode: "LANDLINE", lastCheckedAt: new Date(), deliverabilityStatus: "LANDLINE_NON_MOBILE" }); expect(await guardSmsSend({ phone: "+16183355304", traffic: "PROMOTIONAL" })).toMatchObject({ allowed: false, technicalSuppression: true }) })
  it("requires and audits explicit transactional technical override", async () => { mocks.findUnique.mockResolvedValue({ id: "phone-1", suppressionStatus: "TECHNICAL_SUPPRESSED", suppressionReason: "carrier blocked", providerCode: "BLOCKED", lastCheckedAt: new Date(), deliverabilityStatus: "CARRIER_BLOCKED" }); expect((await guardSmsSend({ phone: "+16183355304", traffic: "TRANSACTIONAL", administratorId: "admin-1", technicalOverrideReason: "Confirmed corrected carrier record" })).allowed).toBe(true); expect(mocks.createReview).toHaveBeenCalledOnce() })
  it("never applies one number's record to another number", async () => { await guardSmsSend({ phone: "+16183355305", traffic: "PROMOTIONAL" }); expect(mocks.findUnique).toHaveBeenCalledWith({ where: { normalizedPhone_channel: { normalizedPhone: "+16183355305", channel: "SMS" } } }) })
})
