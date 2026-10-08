import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { GuidedSalesCall } from "@/components/GuidedSalesCall"
import { buildSalesCallFlow, inferSalesCallType, rankSalesScripts, salesProductCandidates } from "@/lib/sales-call-flow"

afterEach(cleanup)

describe("sales conversation routing", () => {
  it("keeps prospects cold after a prior call and recognizes purchase evidence", () => {
    expect(inferSalesCallType({ status: "Prospect" })).toBe("cold")
    expect(inferSalesCallType({ totalRevenue: "150" })).toBe("update")
    expect(inferSalesCallType({ lastPurchaseAt: "2026-10-01" })).toBe("update")
    expect(inferSalesCallType(null)).toBe("cold")
  })
  it("puts a matched opening ahead of unrelated high-priority scripts and isolates departments", () => {
    const scripts = [
      { name: "Payment", department: "COLLECTIONS", scenario: "PAYMENT", priority: 100 },
      { name: "General", department: "SALES", scenario: "GENERAL", priority: 100 },
      { name: "Intro", department: "SALES", scenario: "INTRO", priority: 0 },
      { name: "Update", department: "SALES", scenario: "FOLLOW_UP", priority: 0 },
    ]
    expect(rankSalesScripts(scripts, "SALES", "cold")[0].name).toBe("Intro")
    expect(rankSalesScripts(scripts, "SALES", "update")[0].name).toBe("Update")
    expect(rankSalesScripts(scripts, "SUPPORT", "cold")).toEqual([])
    expect(scripts[0].name).toBe("Payment")
  })
  it("confirms known facts and asks only missing discovery questions", () => {
    const steps = buildSalesCallFlow({ type: "update", facts: { bladeSizes: '14"', materialsCut: "Concrete", improvementPriority: "Longer life" }, purchaseNames: ["Medusa"] })
    expect(steps[0].speech).toContain("How did Medusa work out?")
    expect(steps[1].speech).toContain("Is that still accurate?")
    expect(steps[1].speech).not.toContain("What blade sizes")
    expect(steps[1].speech).toContain("Where do you currently buy")
    expect(steps[2].speech).toContain('14" blades, cutting Concrete, focused on Longer life')
    expect(steps[2].speech).toContain("next order")
  })
  it("offers a first order with incomplete facts and does not promise fixed promotions", () => {
    const steps = buildSalesCallFlow({ type: "cold" })
    expect(steps[2].speech).toContain("first order")
    expect(steps[4].speech).toContain("when should we review it together")
    expect(steps.map(s => s.speech).join(" ")).not.toMatch(/FREE|30%|\$\d|guarantee/)
    expect(salesProductCandidates({})).toEqual([])
    expect(salesProductCandidates({ materialsCut: "Porcelain" })[0].blade).toBe("Titan Razor Blade")
    expect(salesProductCandidates({ materialsCut: "Unknown alloy" })).toEqual([])
  })
})

describe("guided call controls", () => {
  it("preserves a parent-controlled stage when returning from order tools", () => {
    const change = vi.fn()
    const { unmount } = render(<GuidedSalesCall type="cold" facts={{}} activeStage={2} onStageChange={change} />)
    fireEvent.click(screen.getByRole("button", { name: "Next: Resolve the concern" }))
    expect(change).toHaveBeenCalledWith(3)
    unmount()
    render(<GuidedSalesCall type="cold" facts={{}} activeStage={3} onStageChange={change} />)
    expect(screen.getByRole("heading", { name: "Resolve the concern" })).toBeTruthy()
  })
  it("moves discovery through offer, objection and close without saving or calling automatically", () => {
    const offer = vi.fn(), log = vi.fn()
    render(<GuidedSalesCall type="cold" facts={{}} onOffer={offer} onCloseStep={log}><input aria-label="Blade answer" /></GuidedSalesCall>)
    expect(screen.queryByLabelText("Blade answer")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Next: Find the fit" }))
    expect(screen.getByLabelText("Blade answer")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next: Offer a first order" }))
    expect(offer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Build quote / order" }))
    expect(offer).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Next: Resolve the concern" }))
    expect(screen.getByText("Already have a supplier")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next: Close or agree the next step" }))
    expect(log).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Log outcome & follow-up" }))
    expect(log).toHaveBeenCalledTimes(1)
  })
  it("updates offer wording as facts change and resets when account key changes", () => {
    const { rerender } = render(<GuidedSalesCall key="a" type="cold" facts={{ materialsCut: "Concrete" }} />)
    fireEvent.click(screen.getByRole("button", { name: "3. Offer a first order" }))
    rerender(<GuidedSalesCall key="a" type="cold" facts={{ materialsCut: "Tile" }} />)
    expect(screen.getByText(/So you're using cutting Tile/)).toBeTruthy()
    rerender(<GuidedSalesCall key="b" type="update" facts={{}} />)
    expect(screen.getByRole("heading", { name: "Open & find the buyer" })).toBeTruthy()
    expect(screen.queryByText(/So you're using/)).toBeNull()
  })
})
