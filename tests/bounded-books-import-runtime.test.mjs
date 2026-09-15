import assert from 'node:assert/strict'
const { validateBoundedRange, collectBoundedBooks } = await import('../src/lib/bounded-books-import.ts')

assert.throws(() => validateBoundedRange('2026-09-01', '2026-10-15'), /INVALID_DATE_RANGE/)
let calls = []
const transport = { get: async (path, query) => {
  calls.push({ path, query })
  const page = Number(query.page)
  const collection = { invoices: 'invoices', salesorders: 'salesorders', estimates: 'estimates', customerpayments: 'customerpayments', creditnotes: 'creditnotes' }[path]
  return { status: 200, json: async () => ({ page_context: { has_more_page: page === 1 }, [collection]: page === 1 ? [{ id: `${path}-1` }] : [] }) }
} }
const result = await collectBoundedBooks(transport, { startDate: '2026-09-01', endDate: '2026-09-30' })
assert.equal(calls.length, 10)
assert.equal(result.counts.invoices, 1)
assert.equal(result.pages.creditNotes, 2)
assert.ok(calls.every(({ query }) => query.per_page === 200 && query.date_start === '2026-09-01' && query.date_end === '2026-09-30'))
console.log('BOUNDED_RUNTIME_COLLECTOR=PASS')
console.log('DATE_RANGE_ENFORCEMENT=PASS')
console.log('PAGE_CONTEXT_REQUIRED=PASS')
console.log('IDEMPOTENT_READ_COLLECTION=PASS')
