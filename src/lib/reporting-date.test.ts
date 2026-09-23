import { describe, expect, it } from "vitest"
import { invoiceReportingDate, reportingInvoiceQueryStart } from "./reporting-date"

describe("invoice reporting dates", () => {
  it("keeps weekdays on their source date", () => {
    expect(invoiceReportingDate("2026-09-18T12:00:00Z").toISOString()).toBe("2026-09-18T12:00:00.000Z")
  })

  it("rolls Saturday and Sunday forward to Monday", () => {
    expect(invoiceReportingDate("2026-09-19T12:00:00Z").toISOString()).toBe("2026-09-21T12:00:00.000Z")
    expect(invoiceReportingDate("2026-09-20T12:00:00Z").toISOString()).toBe("2026-09-21T12:00:00.000Z")
  })

  it("widens reporting queries to include the prior weekend", () => {
    expect(reportingInvoiceQueryStart(new Date("2026-09-21T00:00:00Z")).toISOString()).toBe("2026-09-19T00:00:00.000Z")
  })
})
