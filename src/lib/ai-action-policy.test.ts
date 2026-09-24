import { afterEach, describe, expect, it } from "vitest"
import {
  canUseAiTool,
  createAiConfirmationToken,
  getBuiltinAiToolPolicy,
  normalizeAiRole,
  verifyAiConfirmationToken,
} from "./ai-action-policy"

describe("AI action policy", () => {
  const originalSecret = process.env.NEXTAUTH_SECRET
  afterEach(() => { process.env.NEXTAUTH_SECRET = originalSecret })

  it("normalizes application roles and enforces minimum access", () => {
    expect(normalizeAiRole("MASTER_ADMIN")).toBe("ADMIN")
    expect(normalizeAiRole("Collections Manager")).toBe("MANAGER")
    expect(canUseAiTool("AGENT", "MANAGER")).toBe(false)
    expect(canUseAiTool("MANAGER", "AGENT")).toBe(true)
  })

  it("requires confirmation for built-in writes", () => {
    expect(getBuiltinAiToolPolicy("create_task")).toEqual({
      minimumRole: "AGENT",
      mutating: true,
      requiresConfirmation: true,
    })
    expect(getBuiltinAiToolPolicy("query_invoices").mutating).toBe(false)
  })

  it("signs confirmations to a user and rejects tampering", () => {
    process.env.NEXTAUTH_SECRET = "test-only-secret"
    const token = createAiConfirmationToken({ userId: "u1", toolName: "create_task", args: { subject: "Call" } })
    expect(verifyAiConfirmationToken(token, "u1").toolName).toBe("create_task")
    expect(() => verifyAiConfirmationToken(`${token}x`, "u1")).toThrow("Invalid")
    expect(() => verifyAiConfirmationToken(token, "u2")).toThrow("another user")
  })

  it("binds confirmations to the page and record context", () => {
    process.env.NEXTAUTH_SECRET = "test-only-secret"
    const token = createAiConfirmationToken({ userId: "u1", toolName: "create_task", args: { subject: "Call" }, contextKey: "/account?id=account-1" })
    expect(verifyAiConfirmationToken(token, "u1", "/account?id=account-1").toolName).toBe("create_task")
    expect(() => verifyAiConfirmationToken(token, "u1", "/account?id=account-2")).toThrow("another page or record")
  })
})
