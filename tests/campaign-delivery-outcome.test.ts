import { describe, expect, it } from "vitest"
import {
  MISSING_CAMPAIGN_PHONE_ERROR,
  resolveCampaignChunkState,
  summarizeCampaignFailures,
} from "../netlify/functions/lib/campaign-delivery-outcome"

describe("campaign delivery outcomes", () => {
  it("reports a missing-phone recipient instead of silently completing", () => {
    expect(summarizeCampaignFailures(1, [MISSING_CAMPAIGN_PHONE_ERROR])).toBe(
      "1 recipient failed: Account has no valid phone number",
    )
    expect(resolveCampaignChunkState({
      isDone: true,
      successfulCount: 0,
      failedCount: 1,
      providerAttemptCount: 0,
      providerFailureCount: 0,
      failureMessages: [MISSING_CAMPAIGN_PHONE_ERROR],
    })).toEqual({
      status: "DONE",
      errorMessage: "1 recipient failed: Account has no valid phone number",
      providerUnavailable: false,
    })
  })

  it("halts when every Zoho provider attempt in a chunk fails", () => {
    expect(resolveCampaignChunkState({
      isDone: false,
      successfulCount: 0,
      failedCount: 2,
      providerAttemptCount: 2,
      providerFailureCount: 2,
      failureMessages: ["internal server error occurred", "internal server error occurred"],
    })).toEqual({
      status: "ERROR",
      errorMessage: "2 recipients failed: internal server error occurred",
      providerUnavailable: true,
    })
  })

  it("continues when at least one provider delivery succeeds", () => {
    expect(resolveCampaignChunkState({
      isDone: false,
      successfulCount: 1,
      failedCount: 1,
      providerAttemptCount: 2,
      providerFailureCount: 1,
      failureMessages: ["provider rejected recipient"],
    })).toEqual({
      status: "RUNNING",
      errorMessage: "1 recipient failed: provider rejected recipient",
      providerUnavailable: false,
    })
  })
})
