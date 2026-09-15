import { describe, expect, it } from "vitest"
import {
  calculateGlobalHeaderMetrics,
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

  it("counts active invoices and only active uninvoiced orders once", () => {
    const result = calculateGlobalHeaderMetrics(now, [invoice()], [
      order(),
      order({ status: "invoiced", amount: 2_000 }),
      order({ status: "partially_invoiced", amount: 3_000, linkedToInvoice: true }),
    ])
    expect(result).toMatchObject({ weeklySales: 1_350, mtdSales: 1_350, mtdProfit: 400, mtdCommission: 200 })
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

  it("uses canonical commission independent of paid portions", () => {
    const result = calculateGlobalHeaderMetrics(now, [invoice({
      items: { sub_total: 900, profit: 300, commission: 150, computedUpfront: 75, computedFinal: 0 },
    })], [])
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

  it("uses Arizona month/week boundaries and the established excluded rep rule", () => {
    const result = calculateGlobalHeaderMetrics(now, [
      invoice({ issueDate: new Date("2026-09-01T06:59:59Z") }),
      invoice({ issueDate: new Date("2026-09-01T07:00:00Z") }),
      invoice({ computedSalesperson: "PAUL GENCUSKI" }),
    ], [])
    expect(result.mtdSales).toBe(900)
    expect(result.weeklySales).toBe(0)
  })
})
