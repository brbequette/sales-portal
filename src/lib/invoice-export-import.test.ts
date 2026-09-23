import { describe, expect, it } from "vitest"
import { invoiceExportRecord, normalizeAccountName, normalizeInvoiceStatus } from "./invoice-export-import"

describe("invoice export import", () => {
  it("maps Zoho invoice financials without generating outbound work", () => {
    const record = invoiceExportRecord([{ "Invoice ID": "1", "Invoice Number": "100", "Invoice Date": "2026-01-02", "Invoice Status": "Closed", "Customer ID": "c1", "Customer Name": "Acme", Total: "1,250.50", Balance: "0", "Sales person": "Jane", "Item Name": "Blade", Quantity: "2", "Item Price": "500", "Item Total": "1000", "CF.PROFIT": "250.25", "CF.DEAD COST TOTAL": "700", "CF.SALESPERSON VIG": "1.3", "CF.COMMISSION FROM PROFIT %": "50", "CF.SALES COMMISSION": "125.125" }])
    expect(record.zohoId).toBe("1")
    expect(record.update.status).toBe("Paid")
    expect(record.update.amount).toBe(1250.5)
    expect(record.update.computedProfit).toBe(250.25)
    expect(record.update.pendingCostSync).toBe(false)
    expect((record.update.items as any).line_items).toHaveLength(1)
  })

  it("normalizes export lifecycle states", () => {
    expect(normalizeInvoiceStatus("Open")).toBe("Sent")
    expect(normalizeInvoiceStatus("Void")).toBe("Void")
    expect(normalizeInvoiceStatus("Draft")).toBe("Draft")
  })

  it("normalizes exact customer-name fallback keys", () => {
    expect(normalizeAccountName("  Three   Tier Construction ")).toBe("THREE TIER CONSTRUCTION")
  })
})
