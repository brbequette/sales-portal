import { describe, expect, it } from 'vitest'
import { salesNextSteps, salesStepPrompt } from './sales-next-steps'

describe('sales workflow suggestions', () => {
  it('does not reopen completed work or closed deals', () => {
    expect(salesNextSteps({ id: 'a', name: 'Account', tasks: [{ id: 't', status: 'Completed' }], deals: [{ id: 'd', stage: 'Closed Won' }, { id: 'e', stage: 'Closed_Lost' }], quotes: [{ id: 'q', status: 'invoiced' }] })).toEqual([])
  })
  it('prioritizes overdue tasks and distinguishes existing tasks from new suggestions', () => {
    const steps = salesNextSteps({ id: 'a', name: 'Account', tasks: [{ id: 't1', subject: 'Future', dueDate: '2099-01-01' }, { id: 't2', subject: 'Overdue', dueDate: '2020-01-01' }], deals: [{ id: 'd', stage: 'Negotiation', closingDate: '2099-01-01' }] }, Date.parse('2026-10-05'))
    expect(steps[0]).toMatchObject({ title: 'Overdue', urgent: true, existingTask: true })
    expect(steps[2]).toMatchObject({ title: 'Resolve objections and agree the decision date', existingTask: false })
  })
  it('handles missing dates and unknown stages without inventing facts', () => {
    const [step] = salesNextSteps({ id: 'a', name: 'Account', deals: [{ id: 'd' }] })
    expect(step.reason).toContain('Stage not recorded')
    expect(step.urgent).toBe(false)
  })
  it('ties AI automation drafts to exact account and record with confirmation', () => {
    const account = { id: 'a', name: 'Account', deals: [{ id: 'd', name: 'Order', stage: 'Proposal' }] }
    const prompt = salesStepPrompt(account, salesNextSteps(account)[0], true)
    expect(prompt).toContain('account ID a')
    expect(prompt).toContain('Deal d')
    expect(prompt).toContain('duplicates')
    expect(prompt).toContain('without confirmation')
  })
  it('includes every open deal and preserves input records', () => {
    const account = { id: 'a', name: 'Account', deals: Array.from({ length: 22 }, (_, i) => ({ id: String(i), stage: 'Qualification' })) }
    const before = JSON.stringify(account)
    expect(salesNextSteps(account)).toHaveLength(22)
    expect(JSON.stringify(account)).toBe(before)
  })
  it('keeps post-payment completion checks and recognizes actual CRM stages', () => {
    const steps = salesNextSteps({ id: 'a', name: 'Account', deals: [{ id: 'p', stage: 'Invoice Paid' }, { id: 'q', stage: 'Estimate Created' }, { id: 'o', stage: 'PO Issued To Vendor' }, { id: 'i', stage: 'Partially Paid' }] })
    expect(steps.map(step => step.title)).toEqual(['Verify delivery, gift and customer satisfaction before closing', 'Confirm the quote was reviewed and agree a next step', 'Check order progress and confirm delivery expectations', 'Review the outstanding balance and payment follow-up'])
  })
})
