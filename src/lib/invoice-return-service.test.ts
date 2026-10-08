// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ user: { dbId: "rep", userId: "rep", role: "ADMIN" }, invoice: { id: "local", zohoId: "1254360000040824889", items: {}, account: { ownerId: "rep" } }, row: {} as any, db: {} as any, rates: vi.fn(), fetch: vi.fn() }))
vi.mock("../../netlify/functions/lib/auth-middleware", () => ({ authenticateFunction: vi.fn(async () => mocks.user) }))
vi.mock("../../netlify/functions/lib/zoho-auth", () => ({ getZohoAccessToken: vi.fn(async () => "test"), ZOHO_ORGANIZATION_ID: "org", ZOHO_DC: "com" }))
vi.mock("../../netlify/functions/lib/prisma", () => ({ prisma: mocks.db }))
vi.mock("./easyship", () => ({ EASYSHIP_API_URL: "https://easyship.test/2024-09", getEasyshipRates: mocks.rates, lbsToKg: (n: number) => Math.round(n * 453.59237) / 1000, inToCm: (n: number) => n * 2.54 }))
import { returnHandler } from "./invoice-return-service"
import { RETURN_OFFICE } from "./invoice-return"
const id = "11111111-1111-4111-8111-111111111111"
const line = { lineId: "line", itemId: "item", name: "Blade", sku: "B", quantity: 1, unitCredit: 100, unitCost: 50, dropshipped: true }
const call = async (body: any, method = "POST") => {
  const result: any = await returnHandler({ httpMethod: method, body: JSON.stringify({ invoiceId: "local", returnId: id, ...body }), queryStringParameters: { invoiceId: "local" } } as any, {} as any, (() => {}) as any)
  return { status: result.statusCode, ...JSON.parse(result.body) }
}
const response = (body: any) => ({ ok: true, json: async () => body })
beforeEach(() => {
  vi.clearAllMocks(); process.env.EASYSHIP_API_KEY = "test"; vi.stubGlobal("fetch", mocks.fetch)
  mocks.user.role = "ADMIN"; mocks.user.dbId = "rep"
  mocks.row = { id, invoiceId: "local", status: "QUOTED", quotedAt: new Date(), updatedAt: new Date(), rates: [{ courierServiceId: "service", courierName: "Carrier", totalCharge: 17, currency: "USD" }], snapshot: { origin: { ...RETURN_OFFICE, line_1: "123 Client St", city: "Allenton", state: "WI", postal_code: "53002" }, destination: RETURN_OFFICE, box: { length: 17, width: 17, height: 1, weight: 10 }, lines: [line], booksInvoiceId: "1254360000040824889", booksCustomerId: "customer" }, costResponsibility: "TITAN", actualCostCents: null }
  Object.assign(mocks.db, { invoice: { findFirst: vi.fn(async () => mocks.invoice) }, systemSetting: { findUnique: vi.fn(async () => null) }, invoiceReturn: {
    findUnique: vi.fn(async () => ({ ...mocks.row })), findMany: vi.fn(async () => []),
    updateMany: vi.fn(async ({ where, data }: any) => { if (where.status && typeof where.status === "string" && mocks.row.status !== where.status) return { count: 0 }; Object.assign(mocks.row, data); return { count: 1 } }),
    update: vi.fn(async ({ data }: any) => { Object.assign(mocks.row, data); return mocks.row }),
    create: vi.fn(async ({ data }: any) => { mocks.row = { ...data, status: "QUOTING" }; return mocks.row }) },
    $queryRaw: vi.fn(), $transaction: vi.fn(async (fn: any) => fn(mocks.db)) })
})
describe("durable return workflow", () => {
  it("quotes authoritative invoice lines without buying a label", async () => {
    mocks.db.invoiceReturn.findUnique.mockResolvedValueOnce(null)
    mocks.fetch.mockResolvedValueOnce(response({ code: 0, invoice: { invoice_id: "1254360000040824889", invoice_number: "10638", customer_id: "customer", currency_code: "USD", line_items: [{ line_item_id: "line", quantity: 2, rate: 100, item_total: 200 }] } }))
    mocks.rates.mockResolvedValueOnce([{ courierServiceId: "service", totalCharge: 17, currency: "USD" }])
    const result = await call({ action: "quote", reason: "Cancelled", origin: RETURN_OFFICE, box: { length: 17, width: 17, height: 1, weight: 10 }, costResponsibility: "TITAN", lines: [{ lineId: "line", quantity: 1 }] })
    expect(result.return.status).toBe("QUOTED"); expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.fetch.mock.calls[0][0]).toContain("/invoices/1254360000040824889?")
    expect(mocks.rates.mock.calls[0][0].destination_address).toEqual(RETURN_OFFICE)
  })
  it("refuses quantities already reserved by another return", async () => {
    mocks.db.invoiceReturn.findUnique.mockResolvedValueOnce(null); mocks.db.invoiceReturn.findMany.mockResolvedValueOnce([{ snapshot: { lines: [line] } }])
    mocks.fetch.mockResolvedValueOnce(response({ code: 0, invoice: { invoice_id: "1254360000040824889", currency_code: "USD", line_items: [{ line_item_id: "line", quantity: 1, rate: 100, item_total: 100 }] } }))
    expect((await call({ action: "quote", reason: "Cancelled", origin: RETURN_OFFICE, box: { length: 17, width: 17, height: 1, weight: 10 }, costResponsibility: "TITAN", lines: [{ lineId: "line", quantity: 1 }] })).status).toBe(400)
    expect(mocks.db.invoiceReturn.create).not.toHaveBeenCalled(); expect(mocks.rates).not.toHaveBeenCalled()
  })
  it("denies another representative before provider access", async () => { mocks.user.role = "AGENT"; mocks.user.dbId = "other"; expect((await call({ action: "purchase" })).status).toBe(403); expect(mocks.fetch).not.toHaveBeenCalled() })
  it("denies viewer purchases", async () => { mocks.user.role = "VIEWER"; expect((await call({ action: "purchase" })).status).toBe(403) })
  it("rejects the legacy implicit purchase request", async () => { expect((await call({ reason: "cancelled" })).status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled() })
  it("requires explicit price approval", async () => { expect((await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1 })).status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled() })
  it("blocks expired quotes", async () => { mocks.row.quotedAt = new Date(0); expect((await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 })).status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled() })
  it("buys once from client to office with metric box and durable identity", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: "ES1", rates: [{ courier_service: { id: "service" }, currency: "USD", total_charge: 17 }] } })).mockResolvedValueOnce(response({ shipment: { label_state: "created", label_url: "https://labels.test/1.pdf", tracking_number: "T1", total_charge: 17, currency: "USD" } }))
    const data = await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 })
    expect(data.return.status).toBe("LABEL_READY"); expect(data.return.actualCostCents).toBe(1700)
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(payload.origin_address.line_1).toBe("123 Client St"); expect(payload.destination_address).toEqual(RETURN_OFFICE)
    expect(payload.parcels[0].box.length).toBeCloseTo(43.18); expect(payload.parcels[0].total_actual_weight).toBe(4.536)
    expect(mocks.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toContain(id)
    await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 }); expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it("allows only one concurrent purchase claim", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: "ES1", rates: [{ courier_service: { id: "service" }, currency: "USD", total_charge: 17 }] } })).mockResolvedValueOnce(response({ shipment: { label_state: "pending" } }))
    await Promise.all([call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 }), call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 })]); expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it("preserves shipment ID and stops if price changes", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: "ES1", rates: [{ courier_service: { id: "service" }, currency: "USD", total_charge: 18 }] } }))
    const data = await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 }); expect(data.return).toMatchObject({ shipmentId: "ES1", status: "RECONCILE_REQUIRED" }); expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
  it("never retries an ambiguous purchase", async () => { mocks.fetch.mockRejectedValueOnce(new Error("Connection lost")); await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 }); expect(mocks.row.status).toBe("RECONCILE_REQUIRED"); await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 }); expect(mocks.fetch).toHaveBeenCalledTimes(1) })
  it("does not mark a pending label ready", async () => { mocks.fetch.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: "ES1", rates: [{ courier_service: { id: "service" }, currency: "USD", total_charge: 17 }] } })).mockResolvedValueOnce(response({ shipment: { label_state: "pending" } })); expect((await call({ action: "purchase", courierServiceId: "service", approvedCostCents: 1700 })).return.status).toBe("LABEL_PENDING") })
  it("records receipt without mutating invoice balance, inventory or outbound costs", async () => { mocks.row.status = "LABEL_READY"; const result = await call({ action: "receive", lines: [{ lineId: "line", quantity: 1 }], notes: "Received unopened; inspect for restock" }); expect(result.return).toMatchObject({ status: "CREDIT_PENDING", proposedCreditCents: 10000, recoveredCostCents: 5000 }); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.db.invoice.update).toBeUndefined() })
  it("verifies actual credit allocations using the targeted Books endpoint", async () => { mocks.row.status = "CREDIT_PENDING"; mocks.fetch.mockResolvedValueOnce(response({ code: 0, creditnote: { creditnote_id: "1254360000040824999", customer_id: "customer", currency_code: "USD" } })).mockResolvedValueOnce(response({ code: 0, invoices_credited: [{ creditnote_id: "1254360000040824999", invoice_id: "1254360000040824889", credited_amount: 108 }] })).mockResolvedValueOnce(response({ code: 0, invoice: { invoice_id: "1254360000040824889", balance: 25 } })); expect((await call({ action: "reconcile-credit", creditNoteId: "1254360000040824999", expectedCreditCents: 10800 })).return).toMatchObject({ status: "CREDIT_VERIFIED", creditedCents: 10800 }); expect(mocks.fetch.mock.calls[1][0]).toContain("/creditnotes/1254360000040824999/invoices?"); expect(mocks.fetch.mock.calls.every((args: any[]) => !args[1].method || args[1].method === "GET")).toBe(true) })
  it("blocks credits applied to another invoice", async () => { mocks.row.status = "CREDIT_PENDING"; mocks.fetch.mockResolvedValueOnce(response({ code: 0, creditnote: { creditnote_id: "1254360000040824999", customer_id: "customer", currency_code: "USD" } })).mockResolvedValueOnce(response({ code: 0, invoices_credited: [{ creditnote_id: "1254360000040824999", invoice_id: "other", credited_amount: 108 }] })); expect((await call({ action: "reconcile-credit", creditNoteId: "1254360000040824999", expectedCreditCents: 10800 })).status).toBe(400); expect(mocks.row.status).toBe("CREDIT_PENDING") })
})
