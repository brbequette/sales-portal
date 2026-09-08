import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const update = read('netlify/functions/update-payout.ts')
const remove = read('netlify/functions/delete-payout.ts')
const add = read('netlify/functions/add-payout.ts')

describe('conservative payout lifecycle safeguards', () => {
  it.each([
    ['update', update],
    ['delete', remove],
  ])('returns the stable authenticated 409 lock for %s', (_name, source) => {
    expect(source).toContain('authenticateFunction(event, { requireAdmin: true })')
    expect(source).toContain('statusCode: 409')
    expect(source).toContain('PAYOUT_MUTATION_REQUIRES_LEDGER')
    expect(source).toContain('Payout updates and deletions are temporarily locked pending paid-status and ledger tracking.')
  })

  it('performs no payout mutation after the authentication gate', () => {
    for (const source of [update, remove]) {
      const gate = source.indexOf('PAYOUT_MUTATION_REQUIRES_LEDGER')
      expect(gate).toBeGreaterThan(-1)
      expect(source.slice(gate)).not.toContain('prisma.payout.update(')
      expect(source.slice(gate)).not.toContain('prisma.payout.delete(')
    }
  })

  it('leaves payout creation behavior unchanged', () => {
    expect(add).toContain('prisma.payout.create(')
    expect(add).not.toContain('PAYOUT_MUTATION_REQUIRES_LEDGER')
  })

  it('does not introduce automatic lifecycle adjustments', () => {
    expect(read('netlify/functions/zoho-credit-note.ts')).not.toContain('prisma.commission')
    expect(read('netlify/functions/easyship-return.ts')).not.toContain('prisma.payout')
  })
})
