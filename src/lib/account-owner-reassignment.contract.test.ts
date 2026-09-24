import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("account owner reassignment contract", () => {
  it("requires admin authorization, optimistic ownership, idempotency, and audit", () => {
    const handler = read("netlify/functions/update-account-owner.ts")
    expect(handler).toContain("isAdministratorRole(sessionUser.role)")
    expect(handler).toContain("expectedOwnerId")
    expect(handler).toContain('code: "OWNER_CHANGED"')
    expect(handler).toContain("idempotencyKey")
    expect(handler).toContain('actionType: "ACCOUNT_OWNER_REASSIGNMENT"')
    expect(handler).toContain('eventType: "ACCOUNT_OWNER_REASSIGNED"')
    expect(handler).toContain("partial: contactErrors.length > 0")
  })

  it("submits the loaded owner and a unique request id for single and bulk writes", () => {
    const page = read("src/app/admin/update-accounts/page.tsx")
    expect(page.match(/expectedOwnerId: current\.ownerId/g)).toHaveLength(2)
    expect(page.match(/requestId: crypto\.randomUUID\(\)/g)).toHaveLength(2)
    expect(page).toContain("related-contact warnings")
  })
})
