import { describe, expect, it } from 'vitest'
import { dispositionInvoice, dispositionDeal, exactDocumentReference, isCrmId, verifiedCompletion, booksCustomerConflicts } from './deal-lifecycle'
const base = { status: 'sent', amount: 100, balance: 100, paymentMade: 0, dueDate: null, isWrittenOff: false }

it('checks explicit and legacy Books customer IDs without accepting names or numeric coercion', () => {
  expect(booksCustomerConflicts('books-1', { booksCustomerId: 'books-1' })).toBe(false)
  expect(booksCustomerConflicts('books-1', { zohoId: 'books-1' })).toBe(false)
  expect(booksCustomerConflicts(undefined, { zohoId: 'books-1' })).toBe(false)
  expect(booksCustomerConflicts('books-2', { booksCustomerId: 'books-1' })).toBe(true)
  expect(booksCustomerConflicts(123, { booksCustomerId: '123' })).toBe(true)
})
describe('invoice-driven deal dispositions', () => {
  it.each([
    [{ status: 'paid', balance: 0 }, 'Paid'],
    [{ status: 'paid', balance: 40 }, 'Needs Review'],
    [{ status: 'void', balance: 0 }, 'Voided'],
    [{ status: 'Orphaned', balance: 0 }, 'Needs Review'],
    [{ status: 'Paid', isWrittenOff: true }, 'Written Off'],
    [{ status: 'draft', balance: 0 }, 'Draft Invoice'],
    [{ status: 'sent', balance: 0 }, 'Settled — Review Payment'],
    [{ paymentMade: 10, balance: 90 }, 'Partially Paid'],
    [{ dueDate: '2026-09-24', paymentMade: 10 }, 'Overdue'],
    [{ dueDate: '2026-09-25' }, 'Invoiced'],
    [{ syncConflict: true, status: 'paid' }, 'Needs Review'],
    [{ status: 'made-up' }, 'Needs Review'],
  ])('uses evidence %j', (patch, expected) => expect(dispositionInvoice({ ...base, ...patch }, new Date('2026-09-25T14:00:00Z'))).toBe(expected))
  it('preserves pre-invoice opportunities', () => expect(dispositionDeal([])).toBeNull())
  it('does not complete a partly paid multi-invoice deal', () => expect(dispositionDeal([{ ...base, status: 'paid', balance: 0 }, base])).toBe('Partially Paid'))
  it('excludes void invoices from an otherwise paid deal', () => expect(dispositionDeal([{ ...base, status: 'paid', balance: 0 }, { ...base, status: 'void' }])).toBe('Paid'))
  it('requires exact references, not substring collisions', () => { expect(exactDocumentReference('Acme | INV-1001', 'INV-100')).toBe(false); expect(exactDocumentReference('Acme | INV-100', 'inv-100')).toBe(true) })
  it('never sends a local placeholder to CRM', () => expect(isCrmId('invoice:1254360000000000000')).toBe(false))
  it('waits until the Arizona due date has ended before aging a sent invoice', () => expect(dispositionInvoice({ ...base, dueDate: '2026-09-25' }, new Date('2026-09-26T01:00:00Z'))).toBe('Invoiced'))
  it('does not call a paid invoice complete without delivery evidence', () => expect(verifiedCompletion([{ ...base, id: 'i', zohoId: 'zi', salesOrderZohoId: null, status: 'paid', balance: 0 }], [], [])).toBe(false))
  it('rejects manual checkmarks and accepts complete, linked delivery evidence', () => {
    const invoices = [{ ...base, id: 'i', zohoId: 'zi', salesOrderZohoId: 'so', status: 'paid', balance: 0 }]
    const packages = [{ id: 'p', salesOrderId: 'so', status: 'delivered' }]
    const checklist = { documentId: 'i', completedAt: new Date(), paymentVerified: true, giftSent: true, satisfactionChecked: true, evidence: { paymentVerified: { verified: true }, giftSent: { verified: true, packageIds: ['p'] }, satisfactionChecked: { verified: true } } }
    expect(verifiedCompletion(invoices, packages, [checklist])).toBe(true)
    expect(verifiedCompletion(invoices, packages, [{ ...checklist, evidence: { ...checklist.evidence, giftSent: { verified: false } } }])).toBe(false)
    expect(verifiedCompletion(invoices, [{ ...packages[0], status: 'shipped' }], [checklist])).toBe(false)
  })
})
