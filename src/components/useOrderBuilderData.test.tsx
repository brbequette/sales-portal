import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useOrderBuilderData, type OrderLine } from "./useOrderBuilderData"

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
}

describe("useOrderBuilderData", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("clears an uncontrolled cart after a successful transaction", async () => {
    const onSuccess = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/admin/business-defaults") {
        return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1.3, defaultCommissionPct: 50 } }), { status: 200 })
      }
      if (url === "/api/create-transaction") {
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
  })
})
