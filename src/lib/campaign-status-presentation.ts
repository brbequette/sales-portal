const TERMINAL_CAMPAIGN_STATES = new Set(["COMPLETED", "COMPLETED_WITH_ERRORS", "CANCELLED", "LEGACY_QUARANTINED"])

export type CampaignStatusPresentationInput = {
  status: string
  reviewState: string
  recipientCounts: Record<string, number>
  recipientRowCount: number
}

export type CampaignStatusPresentation = {
  lifecycleLabel: string
  submissionLabel: string
  reconciliationLabel: string
  attentionLabel: string | null
}

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, character => character.toUpperCase())
}

export function deriveCampaignStatusPresentation({ status, reviewState, recipientCounts, recipientRowCount }: CampaignStatusPresentationInput): CampaignStatusPresentation {
  const activeSubmissionCount = ["PENDING", "LEASED", "SENDING"].reduce((sum, state) => sum + (recipientCounts[state] || 0), 0)
  const isTerminal = TERMINAL_CAMPAIGN_STATES.has(status)
  const isQuarantined = status === "LEGACY_QUARANTINED"
  const lacksRecipientEvidence = recipientRowCount === 0

  let submissionLabel = "Waiting to submit"
  if (isQuarantined) submissionLabel = "Quarantined"
  else if (status === "CANCELLED" && activeSubmissionCount === 0) submissionLabel = "Submission stopped"
  else if (isTerminal && activeSubmissionCount === 0) submissionLabel = "Submission complete"
  else if (activeSubmissionCount > 0 || reviewState === "SUBMITTING") submissionLabel = "Submitting to provider"

  let reconciliationLabel = "Delivery reconciliation not started"
  if (["AWAITING_DELIVERY_RECEIPTS", "RECONCILING"].includes(reviewState)) reconciliationLabel = "Reconciling delivery"
  else if (["REVIEW_READY", "REVIEWED_CLOSED"].includes(reviewState)) reconciliationLabel = "Reconciliation complete"

  const attentionLabel = isQuarantined || (recipientCounts.AMBIGUOUS || 0) > 0 || (isTerminal && lacksRecipientEvidence)
    ? "Manual review required"
    : null

  return { lifecycleLabel: words(status), submissionLabel, reconciliationLabel, attentionLabel }
}
