import { describe, expect, it } from "vitest"
import { classifyProviderOutcome, normalizeDeliveryStatus, normalizeE164 } from "./campaign-deliverability"

describe("campaign phone deliverability", () => {
  it("normalizes E.164 and rejects unusable input", () => { expect(normalizeE164("(618) 335-5304")).toBe("+16183355304"); expect(normalizeE164("12")).toBeNull() })
  it.each([
    ["invalid number", "INVALID", "TECHNICAL_SUPPRESSED"], ["landline destination", "LANDLINE_NON_MOBILE", "TECHNICAL_SUPPRESSED"], ["carrier blocked", "CARRIER_BLOCKED", "TECHNICAL_SUPPRESSED"], ["ZVSMS-4027 unsupported destination country", "UNSUPPORTED_COUNTRY", "TECHNICAL_SUPPRESSED"], ["STOP opt-out", "OPTED_OUT", "OPT_OUT_SUPPRESSED"],
  ])("permanently classifies %s", (message, disposition, suppression) => { const result = classifyProviderOutcome(null, null, message); expect(result).toMatchObject({ deliverability: disposition, suppression, permanent: true }) })
  it.each(["provider timeout", "rate limit 429", "temporary carrier unavailable", "internal 503", "authentication failure"])("keeps transient %s eligible", message => expect(classifyProviderOutcome(null, null, message)).toMatchObject({ suppression: "ELIGIBLE", permanent: false }))
  it("preserves bounded provider delivery states", () => { expect(normalizeDeliveryStatus("DELIVERED")).toBe("delivered"); expect(normalizeDeliveryStatus("surprise")).toBe("unknown") })
})
