import { describe, expect, it } from "vitest"
import { deriveCampaignStatusPresentation } from "./campaign-status-presentation"

const zeroCounts = { PENDING: 0, LEASED: 0, SENDING: 0, ACCEPTED: 0, FAILED: 0, AMBIGUOUS: 0, SKIPPED: 0 }

describe("deriveCampaignStatusPresentation", () => {
  it.each(["COMPLETED", "COMPLETED_WITH_ERRORS"])("never presents terminal %s as actively submitting", status => {
    const result = deriveCampaignStatusPresentation({ status, reviewState: "SUBMITTING", recipientCounts: zeroCounts, recipientRowCount: 0 })
    expect(result.submissionLabel).toBe("Submission complete")
    expect(result.submissionLabel).not.toContain("Submitting")
    expect(result.attentionLabel).toBe("Manual review required")
  })

  it("presents a cancelled campaign as stopped, not active or complete", () => {
    const result = deriveCampaignStatusPresentation({ status: "CANCELLED", reviewState: "SUBMITTING", recipientCounts: zeroCounts, recipientRowCount: 0 })
    expect(result.submissionLabel).toBe("Submission stopped")
  })

  it("presents quarantined legacy history without implying submission", () => {
    const result = deriveCampaignStatusPresentation({ status: "LEGACY_QUARANTINED", reviewState: "SUBMITTING", recipientCounts: zeroCounts, recipientRowCount: 0 })
    expect(result.submissionLabel).toBe("Quarantined")
    expect(result.attentionLabel).toBe("Manual review required")
  })

  it("keeps completed provider submission separate from delivery reconciliation", () => {
    const result = deriveCampaignStatusPresentation({ status: "COMPLETED_WITH_ERRORS", reviewState: "RECONCILING", recipientCounts: { ...zeroCounts, ACCEPTED: 1567, FAILED: 4, AMBIGUOUS: 12 }, recipientRowCount: 1583 })
    expect(result.submissionLabel).toBe("Submission complete")
    expect(result.reconciliationLabel).toBe("Reconciling delivery")
    expect(result.attentionLabel).toBe("Manual review required")
    expect(1567 + 4 + 12).toBe(1583)
  })

  it("is deterministic across refreshes", () => {
    const input = { status: "COMPLETED", reviewState: "REVIEW_READY", recipientCounts: { ...zeroCounts, ACCEPTED: 1 }, recipientRowCount: 1 }
    expect(deriveCampaignStatusPresentation(input)).toEqual(deriveCampaignStatusPresentation(structuredClone(input)))
    expect(deriveCampaignStatusPresentation(input).reconciliationLabel).toBe("Reconciliation complete")
  })
})
