import { describe, expect, it } from "vitest"
import { normalizeSmsPhone } from "./sms-suppression"
describe("shared SMS suppression guard", () => { it("normalizes one number without affecting account peers", () => { expect(normalizeSmsPhone("618-335-5304")).toBe("+16183355304"); expect(normalizeSmsPhone("618-335-5305")).toBe("+16183355305") }); it("rejects malformed numbers", () => expect(normalizeSmsPhone("none")).toBeNull()) })
