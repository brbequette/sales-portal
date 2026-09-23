import { describe, expect, it } from "vitest"
import { resolveCommissionPct } from "./cost-calculations"

const settings = { commission_rate_pct: 50 } as any

function document(date: string, rate: number) {
  return { date, custom_fields: [{ label: "COMMISSION FROM PROFIT %", value: rate }] }
}

describe("2025–2026 commission rate correction", () => {
  it("normalizes legacy 40% documents to 50%", () => {
    expect(resolveCommissionPct(document("2025-01-01", 40), settings)).toBe(50)
    expect(resolveCommissionPct(document("2026-12-31", 40), settings)).toBe(50)
  })

  it("does not rewrite years outside the approved window", () => {
    expect(resolveCommissionPct(document("2024-12-31", 40), settings)).toBe(40)
    expect(resolveCommissionPct(document("2027-01-01", 40), settings)).toBe(40)
  })

  it("preserves non-40 explicit agreements", () => {
    expect(resolveCommissionPct(document("2026-06-01", 35), settings)).toBe(35)
  })
})
