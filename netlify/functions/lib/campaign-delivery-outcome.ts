export const MISSING_CAMPAIGN_PHONE_ERROR = "Account has no valid phone number"

type CampaignChunkStateInput = {
  isDone: boolean
  successfulCount: number
  failedCount: number
  providerAttemptCount: number
  providerFailureCount: number
  failureMessages: string[]
}

export function summarizeCampaignFailures(failedCount: number, failureMessages: string[]): string | null {
  if (failedCount === 0) return null

  const uniqueMessages = [...new Set(failureMessages.filter(Boolean))]
  const failureLabel = `${failedCount} recipient${failedCount === 1 ? "" : "s"} failed`
  if (uniqueMessages.length === 0) return failureLabel
  if (uniqueMessages.length === 1) return `${failureLabel}: ${uniqueMessages[0]}`
  return `${failureLabel}: ${uniqueMessages.slice(0, 3).join("; ")}`
}

export function resolveCampaignChunkState(input: CampaignChunkStateInput) {
  const providerUnavailable =
    input.providerAttemptCount > 0 &&
    input.providerFailureCount === input.providerAttemptCount &&
    input.successfulCount === 0
  const status = providerUnavailable ? "ERROR" : input.isDone ? "DONE" : "RUNNING"
  const errorMessage = summarizeCampaignFailures(input.failedCount, input.failureMessages)

  return { status, errorMessage, providerUnavailable }
}
