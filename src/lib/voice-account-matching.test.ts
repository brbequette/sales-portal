// @vitest-environment node
import { expect, it, vi } from "vitest"
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
import { matchVoiceContacts, normalizeVoicePhone } from "./voice-account-matching"
const contact = { id: "contact", accountId: "account", phone: "(618) 335-5304", mobilePhone: null }
it("normalizes US phones without collapsing international numbers", () => {
  expect(normalizeVoicePhone("+1 618-335-5304")).toBe("6183355304")
  expect(normalizeVoicePhone("+44 6183355304")).toBe("")
})
it("does not assign business forwarding numbers to a customer", () => {
  expect(matchVoiceContacts({ direction: "INBOUND", fromNumber: "8556750511" }, [{ ...contact, phone: "8556750511" }]).status).toBe("UNRESOLVED")
})
it("requires a known direction and full unique number", () => {
  expect(matchVoiceContacts({ fromNumber: contact.phone }, [contact]).status).toBe("UNRESOLVED")
  expect(matchVoiceContacts({ direction: "INBOUND", fromNumber: "+1 6183355304" }, [contact])).toMatchObject({ status: "MATCHED", accountId: "account", contactId: "contact" })
})
it("keeps cross-account matches ambiguous and same-account contact identity unspecified", () => {
  const input = { direction: "INBOUND", fromNumber: contact.phone }
  expect(matchVoiceContacts(input, [contact, { ...contact, id: "other", accountId: "other" }]).status).toBe("AMBIGUOUS")
  expect(matchVoiceContacts(input, [contact, { ...contact, id: "other" }])).toMatchObject({ status: "MATCHED", contactId: null })
})
