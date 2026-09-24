import { describe, expect, it } from "vitest"
import { accountAssignmentStatusQuery } from "./account-assignment-scope"

describe("account assignment scope", () => {
  it("does not restrict the all-accounts view to Update Status", () => {
    expect(accountAssignmentStatusQuery("ALL")).toBe("")
  })

  it("preserves the existing Update Status queue as an explicit filter", () => {
    expect(accountAssignmentStatusQuery("UPDATE_STATUS")).toBe("&statusFilter=Update%20Status")
  })
})
