import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { buildCollectionsScript } from '../src/lib/collections-script'
import { CollectionsScript } from '../src/components/CollectionsScript'
const invoice = (days: number, id = '1') => ({ id, invoice_number: `INV-${id}`, customer_name: 'SHANK CONCRETE', balance: 12024.18, due_date: '2026-09-27', days_overdue: days, customer_contacts: [{ name: 'JADE SHANK', isPrimary: true }] })
afterEach(cleanup)
it.each([[0, 'Due-date review'], [1, '1–14'], [14, '1–14'], [15, '15–29'], [29, '15–29'], [30, '30–44'], [44, '30–44'], [45, '45–59'], [59, '45–59'], [60, '60–90'], [90, '60–90'], [91, '91+']])('uses the correct stage at %s days', (days, stage) => {
  expect(buildCollectionsScript([invoice(Number(days))], 'Ashley Rowley')?.stage).toContain(stage)
})
it('renders human wording and exact customer data without clipping the script panel', () => {
  render(<CollectionsScript invoices={[invoice(8)]} callerName="ASHLEY ROWLEY" />)
  const panel = screen.getByRole('region', { name: 'Collections script' })
  expect(panel.className).toContain('shrink-0')
  expect(panel.className).not.toContain('overflow-hidden')
  expect(panel.textContent).toContain('Hi Jade Shank, this is Ashley Rowley')
  expect(panel.textContent).toContain('Shank Concrete')
  expect(panel.textContent).toContain('$12,024.18 remaining')
  expect(panel.textContent).toContain('due 2026-09-27, now 8 days overdue')
})
it('recomputes amount and escalation when the invoice selection changes', () => {
  const { rerender } = render(<CollectionsScript invoices={[invoice(8), { ...invoice(100, '2'), balance: 10 }]} callerName="Ashley" />)
  expect(screen.getByText('91+ days · Final demand')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Collections script' }).textContent).toContain('$12,034.18')
  rerender(<CollectionsScript invoices={[invoice(8)]} callerName="Ashley" />)
  expect(screen.queryByText('91+ days · Final demand')).toBeNull()
  expect(screen.getByText('1–14 days · Friendly reminder')).toBeTruthy()
  rerender(<CollectionsScript invoices={[]} callerName="Ashley" />)
  expect(screen.getByText('Select at least one invoice to prepare the call script.')).toBeTruthy()
})
it('keeps criminal possibilities in internal evidence-based review, never a spoken threat', () => {
  const script = buildCollectionsScript([invoice(100)], 'Ashley')!
  expect(script.paragraphs.join(' ')).toContain('final request for payment')
  expect(script.paragraphs.join(' ')).not.toMatch(/arrest|criminal|prosecution|jail|fraud/i)
  expect(script.legalReview).toContain('separate documented evidence')
  expect(script.voicemail).not.toContain('$')
  expect(script.voicemail).not.toContain('INV-')
})
