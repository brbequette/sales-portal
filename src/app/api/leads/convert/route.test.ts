import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthenticatedDbUser: vi.fn(),
  findLead: vi.fn(),
  findAccount: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedDbUser: mocks.getAuthenticatedDbUser,
}))

vi.mock("@/lib/zoho-auth", () => ({
  getZohoAccessToken: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: mocks.findLead },
    account: { findUnique: mocks.findAccount },
    $transaction: mocks.transaction,
  },
}))

import { POST } from "./route"

describe("lead conversion replay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthenticatedDbUser.mockResolvedValue({
      isAdmin: true,
      user: { id: "admin-1" },
    })
  })

  it("returns the existing account without starting another conversion transaction", async () => {
    mocks.findLead.mockResolvedValue({
      id: "lead-1",
      zohoId: "lead-source-1",
      company: "Existing Customer",
      ownerId: "rep-1",
      claimedById: null,
      convertedAccountId: "account-1",
    })
    mocks.findAccount.mockResolvedValue({ id: "account-1" })

    const response = await POST(new Request("http://localhost/api/leads/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: "lead-1" }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      accountId: "account-1",
      alreadyConverted: true,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
