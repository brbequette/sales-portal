import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TITAN_GIFT_HAT, TITAN_GIFT_HAT_BOOKS_ITEM_ID, useOrderBuilderData, type OrderLine } from "./useOrderBuilderData"

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
  canDropship: true,
  vendor: "Verified Vendor",
  fulfillmentMethod: "DROPSHIP",
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
        return new Response(JSON.stringify({ success: true, transaction: { id: "local-quote", zohoId: "books-quote" }, booksRefId: "books-quote", documentNumber: "EST-100", localDevelopmentTransaction: true }), { status: 200 })
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
    expect(onSuccess).toHaveBeenCalledWith({ type: "SalesOrder", localId: "local-quote", booksId: "books-quote", documentNumber: "EST-100", alreadyProcessed: false })
    expect(submittedBody.lineItems[0].itemId).toBe("books-item-zeus")
    expect(submittedBody.lineItems[0]).toMatchObject({ fulfillmentMethod: "DROPSHIP", vendor: "Verified Vendor" })
    expect(submittedBody.requestId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it("offers every configured active gift plus the authoritative Zoho hat and excludes administrative gifts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/business-defaults") return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1, defaultCommissionPct: 50 } }), { status: 200 })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    const products = [
      { id: "hat", zohoId: TITAN_GIFT_HAT_BOOKS_ITEM_ID, name: "Titan Hat", sku: "HAT", price: 10, cost: 5, description: "{}", giftItem: false },
      { id: "flashlight", booksItemId: "books-flashlight", name: "Flashlight", sku: "LIGHT", price: 12, unitCost: 4, costQuality: "AUTHORITATIVE", description: "{}", giftItem: true },
      { id: "shipping", booksItemId: "shipping-id", name: "FREESHIP", sku: "FREESHIP", price: 0, unitCost: 1, costQuality: "AUTHORITATIVE", description: "{}", giftItem: true },
      { id: "inactive", booksItemId: "inactive-id", name: "Old Gift", sku: "OLD", price: 0, unitCost: 2, costQuality: "AUTHORITATIVE", description: JSON.stringify({ status: "inactive" }), giftItem: true },
      { id: "unknown", booksItemId: "unknown-id", name: "Unknown Cost Gift", sku: "UNKNOWN", price: 0, unitCost: 0, costQuality: "UNKNOWN", description: "{}", giftItem: true },
    ]
    const { result } = renderHook(() => useOrderBuilderData({ orderLines: [startingLine], catalogProducts: products, accountPurchases: [] }))
    await waitFor(() => expect(result.current.qualifyingGifts).toHaveLength(2))
    expect(result.current.qualifyingGifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: TITAN_GIFT_HAT_BOOKS_ITEM_ID, sku: "HAT", price: 0 }),
      expect.objectContaining({ itemId: "books-flashlight", sku: "LIGHT", price: 0 }),
    ]))
    expect(result.current.qualifyingGifts.map(gift => gift.sku)).not.toEqual(expect.arrayContaining(["FREESHIP", "OLD", "UNKNOWN"]))
  })

  it("preserves ordinary profit limits and permits only an audited gift override", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/business-defaults") return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1, defaultCommissionPct: 50 } }), { status: 200 })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    const lowProfitLine = { ...startingLine, unitPrice: 0.91, cost: 0.36 }
    const { result, rerender } = renderHook(({ products }) => useOrderBuilderData({ orderLines: [lowProfitLine], catalogProducts: products, accountPurchases: [] }), { initialProps: { products: [] as any[] } })
    await waitFor(() => expect(result.current.qualifyingGifts).toHaveLength(0))
    rerender({ products: [{ ...TITAN_GIFT_HAT, attributes: { giftProfitOverride: true, giftReleaseRule: 'IMMEDIATE', giftTags: ['shirt', 'patriot'], giftSizes: ['M', 'L'], giftBundleRequiresShirt: true } }] })
    await waitFor(() => expect(result.current.qualifyingGifts).toHaveLength(1))
    expect(result.current.qualifyingGifts[0]).toMatchObject({ itemId: TITAN_GIFT_HAT_BOOKS_ITEM_ID, cost: 20, price: 0, giftReleaseRule: 'IMMEDIATE', giftTags: ['shirt', 'patriot'], giftSizes: ['M', 'L'], giftBundleRequiresShirt: true })
  })

  it("blocks missing cost while preserving an explicitly verified zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/business-defaults") return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1, defaultCommissionPct: 50 } }), { status: 200 })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    const { result } = renderHook(() => useOrderBuilderData({ catalogProducts: [], accountPurchases: [] }))
    await act(async () => { await Promise.resolve() })
    act(() => result.current.openAddItemModal({ name: 'Unknown Cost', sku: 'UNKNOWN', price: 1, cost: 0, costQuality: 'UNKNOWN' }))
    expect(result.current.pendingItem).toBeNull()
    act(() => result.current.openAddItemModal({ name: 'Verified Gift', sku: 'ZERO', price: 0, cost: 0, costQuality: 'VERIFIED_ZERO', giftItem: true }))
    expect(result.current.pendingItem).toMatchObject({ sku: 'ZERO', cost: 0, costQuality: 'VERIFIED_ZERO' })
  })

  it('requires and persists a shirt size for a bundled gift', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/business-defaults') return new Response(JSON.stringify({ success: true, defaults: { defaultVigRate: 1, defaultCommissionPct: 50 } }), { status: 200 })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    const { result } = renderHook(() => useOrderBuilderData({ catalogProducts: [], accountPurchases: [] }))
    const bundle = { name: 'Patriot Pack', sku: 'PATRIOT', price: 0, cost: 25, costQuality: 'AUTHORITATIVE' as const, giftItem: true, giftBundleRequiresShirt: true, giftSizes: ['M', 'L'], giftReleaseRule: 'PAID_IN_FULL' as const, fixedBundleCost: 12, giftBundleComponents: [{ mode: 'VARIABLE_TAG' as const, optionTag: 'shirt', quantity: 1 }], bundleOptions: [{ productId: 'shirt-l', booksItemId: 'books-shirt-l', sku: 'SHIRT-L', name: 'Titan Shirt L', size: 'L', cost: 8, quantity: 1 }] }
    act(() => result.current.openAddItemModal(bundle))
    act(() => result.current.confirmAddItem())
    expect(result.current.orderLines).toHaveLength(0)
    act(() => result.current.setSelectedGiftOptionId('shirt-l::L'))
    act(() => result.current.confirmAddItem())
    expect(result.current.orderLines).toEqual([expect.objectContaining({ sku: 'PATRIOT', isPromo: true, cost: 20, selectedGiftSize: 'L', selectedBundleOption: expect.objectContaining({ booksItemId: 'books-shirt-l', sku: 'SHIRT-L' }), giftBundleRequiresShirt: true, giftReleaseRule: 'PAID_IN_FULL' })])
  })
})
