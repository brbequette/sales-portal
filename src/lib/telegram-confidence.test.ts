import { describe, expect, it } from 'vitest'
import { assessTelegramReadiness, type OutcomeSample } from './telegram-confidence'
const good: OutcomeSample = { reviewedCorrect: true, verified: true, failed: false }
describe('Observed outcomes govern automatic approval eligibility', () => {
  it('never promotes an unreviewed or small sample, even with perfect execution', () => {
    expect(assessTelegramReadiness([], true).eligible).toBe(false)
    expect(assessTelegramReadiness(Array(49).fill(good), true).eligible).toBe(false)
    expect(assessTelegramReadiness(Array(100).fill({ ...good, reviewedCorrect: null }), true).eligible).toBe(false)
  })
  it('requires complete evidence and pauses on a recent failure or incorrect outcome', () => {
    expect(assessTelegramReadiness(Array(50).fill(good), true).eligible).toBe(true)
    expect(assessTelegramReadiness(Array(50).fill(good), false)).toMatchObject({ score: 0, eligible: false })
    expect(assessTelegramReadiness([{ ...good, failed: true }, ...Array(99).fill(good)], true).eligible).toBe(false)
    expect(assessTelegramReadiness([{ ...good, reviewedCorrect: false }, ...Array(99).fill(good)], true).eligible).toBe(false)
  })
  it('does not count unverified success as correct evidence', () => {
    expect(assessTelegramReadiness(Array(60).fill({ ...good, verified: false }), true)).toMatchObject({ correct: 0, eligible: false })
  })
})
