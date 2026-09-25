import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TITAN_GIFT_HAT_BOOKS_ITEM_ID, useOrderBuilderData, type OrderLine } from "./useOrderBuilderData"

vi.mock("@/components/ZohoProvider", () => ({
  useZoho: () => ({ zohoContext: { email: "rep@development.invalid" } }),
}))

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ preferences: {} }),
}))

vi.mock("react-hot-toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const startingLine: OrderLine = {
  id: "line-1",
  name: "THE ZEUS",
  sku: "ZEUS-14",
  quantity: 1,
  unitPrice: 249.99,
  cost: 100,
  isPromo: false,
  itemId: "books-item-zeus",
}

describe("useOrderBuilderData", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("clears an uncontrolled cart after a successful transaction", async () => {
    const onSuccess = vi.fn()
    let submittedBody: any = null
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/admin/business-defaults") {
        return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1.3, defaultCommissionPct: 50 } }), { status: 200 })
      }
      if (url === "/api/create-transaction") {
        submittedBody = JSON.parse(String(init?.body || "{}"))
        return new Response(JSON.stringify({ success: true, localDevelopmentTransaction: true }), { status: 200 })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    const { result } = renderHook(() => useOrderBuilderData({
      orderLines: [startingLine],
      catalogProducts: [],
      accountPurchases: [],
      accountId: "development-account",
      onSuccess,
    }))

    expect(result.current.orderLines).toHaveLength(1)

    await act(async () => {
      await result.current.handleConfirmOrder()
    })

    await waitFor(() => expect(result.current.orderLines).toHaveLength(0))
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(submittedBody.lineItems[0].itemId).toBe("books-item-zeus")
  })

  it("offers the authoritative Zoho hat even without a local gift flag and excludes administrative gifts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/business-defaults") return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1, defaultCommissionPct: 50 } }), { status: 200 })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    const products = [
      { id: "hat", zohoId: TITAN_GIFT_HAT_BOOKS_ITEM_ID, name: "Titan Hat", sku: "HAT", price: 10, cost: 5, description: "{}", giftItem: false },
      { id: "shipping", zohoId: "shipping-id", name: "Shipping Fee", sku: "SHIP", price: 0, cost: 0, description: "{}", giftItem: true },
    ]
    const { result } = renderHook(() => useOrderBuilderData({ orderLines: [startingLine], catalogProducts: products, accountPurchases: [] }))
    await waitFor(() => expect(result.current.qualifyingGifts).toHaveLength(1))
    expect(result.current.qualifyingGifts[0]).toMatchObject({ itemId: TITAN_GIFT_HAT_BOOKS_ITEM_ID, sku: "HAT" })
  })
})
