import { describe, expect, it } from "vitest"
import {
  calculateGlobalHeaderMetrics,
  parseGlobalHeaderSummary,
  resolveGlobalHeaderScope,
  scopeGlobalHeaderDocuments,
  type HeaderInvoice,
  type HeaderSalesOrder,
} from "../src/lib/global-header-metrics"

const invoice = (overrides: Partial<HeaderInvoice> = {}): HeaderInvoice => ({
  amount: 1_000, balance: 0, status: "sent", issueDate: new Date("2026-09-14T00:00:00Z"),
  dueDate: null, items: { sub_total: 900, profit: 300, commission: 150 },
  computedProfit: 300, computedSalesperson: "REP ONE", syncConflict: false, pendingZohoFetch: false,
  ...overrides,
})
const order = (overrides: Partial<HeaderSalesOrder> = {}): HeaderSalesOrder => ({
  amount: 500, status: "open", orderDate: new Date("2026-09-14T00:00:00Z"),
  items: { sub_total: 450, profit: 100, commission: 50, salesperson_name: "REP ONE" },
  syncConflict: false, pendingZohoFetch: false, linkedToInvoice: false, ...overrides,
})

describe("global header financial rules", () => {
  const now = new Date("2026-09-15T19:00:00Z")

  it("reproduces the 2026-09-15 read-only Netlify production totals", () => {
    const result = calculateGlobalHeaderMetrics(now, [
      invoice({
        amount: 40_281.14, balance: 79_138.92,
        issueDate: new Date("2026-09-01T00:00:00Z"), dueDate: new Date("2026-09-01T00:00:00Z"),
        computedProfit: 13_122.10,
        items: { sub_total: 40_281.14, cf_commission_amount: "$6,561.04" },
      }),
      invoice({
        amount: 0, balance: 82_415.66,
        issueDate: new Date("2026-08-01T00:00:00Z"), dueDate: new Date("2026-09-30T00:00:00Z"),
        computedProfit: 0, items: { sub_total: 0 },
      }),
    ], [order({
      amount: 4_499.75,
      items: { sub_total: 4_499.75, cf_estimated_profit: "$1,799.90", salesCommission: "$899.95" },
    })])

    expect(result).toEqual({
      weeklySales: 4_499.75,
      mtdSales: 44_780.89,
      mtdProfit: 14_922,
      mtdCommission: 7_460.99,
      pipeline: 166_054.33,
      overdue: 79_138.92,
    })
  })

  it("counts active invoices and only active uninvoiced orders once", () => {
    const result = calculateGlobalHeaderMetrics(now, [invoice()], [
      order(),
      order({ status: "invoiced", amount: 2_000 }),
      order({ status: "partially_invoiced", amount: 3_000, linkedToInvoice: true }),
    ])
    expect(result).toMatchObject({ weeklySales: 1_350, mtdSales: 1_350, mtdProfit: 400, mtdCommission: 200 })
  })

  it("excludes converted and invoice-linked sales orders to prevent duplication", () => {
    const result = calculateGlobalHeaderMetrics(now, [invoice()], [
      order({ status: "invoiced" }),
      order({ status: "converted" }),
      order({ linkedToInvoice: true }),
    ])
    expect(result.mtdSales).toBe(900)
  })

  it("excludes every terminal sales-order status", () => {
    const terminalOrders = ["draft", "void", "voided", "cancelled", "canceled", "deleted", "declined", "orphaned"]
      .map(status => order({ status }))
    expect(calculateGlobalHeaderMetrics(now, [], terminalOrders).mtdSales).toBe(0)
  })

  it("excludes draft, terminal, orphaned, conflicted, and pending-fetch documents", () => {
    const invalidInvoices = [
      invoice({ status: "draft" }), invoice({ status: "void" }), invoice({ status: "orphaned" }),
      invoice({ syncConflict: true }), invoice({ pendingZohoFetch: true }),
    ]
    const invalidOrders = [
      order({ status: "draft" }), order({ status: "orphaned" }), order({ syncConflict: true }),
      order({ pendingZohoFetch: true }), order({ linkedToInvoice: true }),
    ]
    expect(calculateGlobalHeaderMetrics(now, invalidInvoices, invalidOrders)).toEqual({
      weeklySales: 0, mtdSales: 0, mtdProfit: 0, mtdCommission: 0, pipeline: 0, overdue: 0,
    })
  })

  it("uses currency-formatted canonical commission independent of paid portions", () => {
    const result = calculateGlobalHeaderMetrics(now, [invoice({
      items: { sub_total: "$900.00", profit: "$300.00", salesCommission: "$150.00", computedUpfront: 75, computedFinal: 0 },
      computedProfit: null,
    })], [])
    expect(result.mtdSales).toBe(900)
    expect(result.mtdProfit).toBe(300)
    expect(result.mtdCommission).toBe(150)
  })

  it("uses balance for open and overdue invoices and subtotal for active orders", () => {
    const result = calculateGlobalHeaderMetrics(now, [
      invoice({ balance: 275, dueDate: new Date("2026-09-10T00:00:00Z") }),
      invoice({ balance: 125, status: "overdue", dueDate: new Date("2026-09-20T00:00:00Z") }),
      invoice({ balance: 400, status: "paid" }),
    ], [order()])
    expect(result.pipeline).toBe(850)
    expect(result.overdue).toBe(400)
  })

  it("includes UTC-midnight date-only records on the first of the Arizona month", () => {
    const result = calculateGlobalHeaderMetrics(now, [
      invoice({ issueDate: new Date("2026-08-31T23:59:59Z") }),
      invoice({ issueDate: new Date("2026-09-01T00:00:00Z") }),
    ], [])
    expect(result.mtdSales).toBe(900)
    expect(result.weeklySales).toBe(0)
  })

  it("gives MASTER_ADMIN and administrator-salesperson sessions the same company scope", () => {
    expect(resolveGlobalHeaderScope("MASTER_ADMIN")).toBe("company")
    expect(resolveGlobalHeaderScope("ADMIN")).toBe("company")
    const records = [invoice({ accountOwnerId: "other", computedSalesperson: "OTHER REP" })]
    expect(scopeGlobalHeaderDocuments("company", { id: "admin", name: "ADMIN REP" }, records, []).invoices).toHaveLength(1)
  })

  it("restricts ordinary salesperson sessions to owned or assigned documents", () => {
    expect(resolveGlobalHeaderScope("AGENT")).toBe("personal")
    const records = [
      invoice({ accountOwnerId: "rep-1", computedSalesperson: "OTHER REP" }),
      invoice({ accountOwnerId: "other", computedSalesperson: "REP ONE" }),
      invoice({ accountOwnerId: "other", computedSalesperson: "REP TWO" }),
    ]
    const scoped = scopeGlobalHeaderDocuments("personal", { id: "rep-1", name: "REP ONE" }, records, [])
    expect(scoped.invoices).toHaveLength(2)
  })

  it("fails closed when the runtime summary is missing, malformed, or unscoped", () => {
    expect(parseGlobalHeaderSummary({ error: "unavailable" })).toBeNull()
    expect(parseGlobalHeaderSummary({ summary: { weeklySales: 1 } })).toBeNull()
    expect(parseGlobalHeaderSummary({
      scope: "company",
      summary: { weeklySales: 1, mtdSales: 2, mtdProfit: 3, mtdCommission: 4, pipeline: 5, overdue: 6 },
    })).toEqual({ scope: "company", weeklySales: 1, mtdSales: 2, mtdProfit: 3, mtdCommission: 4, pipeline: 5, overdue: 6 })
  })
})
