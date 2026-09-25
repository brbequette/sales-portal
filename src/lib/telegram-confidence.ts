export type OutcomeSample = { reviewedCorrect: boolean | null; verified: boolean; failed: boolean }

// This is operational readiness, not a probability that a model statement is true.
// No model-supplied confidence value participates in this calculation.
export function assessTelegramReadiness(samples: OutcomeSample[], evidenceComplete: boolean) {
  const recent = samples.slice(0, 100)
  const reviewed = recent.filter(s => s.reviewedCorrect !== null)
  const correct = reviewed.filter(s => s.reviewedCorrect === true && s.verified && !s.failed).length
  const failed = recent.slice(0, 50).some(s => s.failed || s.reviewedCorrect === false)
  const score = evidenceComplete ? Math.floor(100 * correct / (reviewed.length + 2)) : 0
  return { score, reviewed: reviewed.length, correct, evidenceComplete, recentFailure: failed, eligible: evidenceComplete && reviewed.length >= 50 && correct / reviewed.length >= 0.98 && score >= 95 && !failed }
}
