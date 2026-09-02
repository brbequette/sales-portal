import { describe, expect, it } from "vitest"
import { normalizeLeadInput, normalizeLeadPhone, validateLeadInput } from "./lead-intake"

describe("lead intake", () => {
  it("normalizes email, state, whitespace, and US phone numbers", () => {
    expect(normalizeLeadPhone("+1 (480) 555-0188")).toBe("4805550188")
    expect(normalizeLeadInput({ company: "  Desert Edge LLC ", firstName: " Mike ", email: " MIKE@EXAMPLE.COM ", state: "az" })).toMatchObject({ company: "Desert Edge LLC", firstName: "Mike", email: "mike@example.com", state: "AZ" })
  })

  it("rejects incomplete and malformed customer identity", () => {
    expect(validateLeadInput({ company: "", email: "bad", phone: "123" })).toMatchObject({ company: expect.any(String), contact: expect.any(String), email: expect.any(String), phone: expect.any(String) })
  })
})
